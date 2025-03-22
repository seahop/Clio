// backend/lib/passport-google.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const googleConfig = require('../config/google-sso');
const AuthService = require('../services/auth.service');
const eventLogger = require('./eventLogger');
const { redisClient } = require('./redis');

const initializeGoogleSSO = () => {
  console.log('Initializing Google SSO with config:');
  console.log('  Client ID:', googleConfig.clientID ? `${googleConfig.clientID.substring(0, 8)}...` : 'MISSING');
  console.log('  Callback URL:', googleConfig.callbackURL);

  if (!googleConfig.clientID || !googleConfig.clientSecret) {
    console.error('Google SSO configuration is incomplete - missing client ID or secret');
    return false;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: googleConfig.clientID,
        clientSecret: googleConfig.clientSecret,
        callbackURL: googleConfig.callbackURL,
        passReqToCallback: true
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          console.log('Google auth callback received profile:', {
            id: profile.id,
            displayName: profile.displayName,
            hasEmails: profile.emails && profile.emails.length > 0
          });

          // Get user email
          const email = profile.emails && profile.emails[0] && profile.emails[0].value;
          if (!email) {
            console.error('No email found in Google profile');
            return done(new Error('No email found in Google profile'));
          }

          console.log('Checking if user exists with Google ID:', profile.id);
          // Check if user already exists in our system
          const existingUser = await findUserByGoogleId(profile.id);
          
          if (existingUser) {
            console.log('Existing user found:', existingUser.username);
            // User exists - create user object for JWT
            const user = AuthService.createUserObject(existingUser.username, false); // Always regular user
            return done(null, user);
          } else {
            console.log('No existing user found, creating new user from email:', email);
            // New user - create account
            // Create a username from Google email (remove @ and domain)
            const proposedUsername = email.split('@')[0];
            
            // Create a new user - always as a regular user, never admin
            const username = await createGoogleUser(profile.id, email, proposedUsername);
            console.log('Created new user:', username);
            
            const user = AuthService.createUserObject(username, false); // Always regular user
            
            // Log the new account creation
            await eventLogger.logSecurityEvent('google_account_created', username, {
              googleId: profile.id,
              email: email,
              isAdmin: false
            });
            
            return done(null, user);
          }
        } catch (error) {
          console.error('Google authentication error:', error);
          return done(error);
        }
      }
    )
  );
  
  console.log('Google SSO strategy initialized successfully');
  return true;
};

// Helper function to find a user by Google ID
const findUserByGoogleId = async (googleId) => {
  try {
    // Check if there's a mapping for this Google ID
    const userKey = `google:${googleId}`;
    const username = await redisClient.get(userKey);
    
    if (username) {
      console.log(`Found username ${username} for Google ID ${googleId}`);
      return { username };
    }
    
    console.log(`No user found for Google ID ${googleId}`);
    return null;
  } catch (error) {
    console.error('Error finding user by Google ID:', error);
    throw error;
  }
};

// Helper function to create a new user from Google account
const createGoogleUser = async (googleId, email, proposedUsername) => {
  try {
    // Sanitize username
    let username = proposedUsername.replace(/[^a-zA-Z0-9_-]/g, '_');
    let counter = 1;
    
    console.log(`Attempting to create user with base username: ${username}`);
    
    // Keep trying usernames until we find one that doesn't exist
    while (await redisClient.exists(`user:${username}:exists`)) {
      console.log(`Username ${username} already exists, trying next variant`);
      username = `${proposedUsername}${counter}`;
      counter++;
    }
    
    console.log(`Creating new Google user with username: ${username}`);
    
    // Store user mappings in Redis
    await redisClient.set(`google:${googleId}`, username);
    await redisClient.set(`user:${username}:googleId`, googleId);
    await redisClient.set(`user:${username}:email`, email);
    await redisClient.set(`user:${username}:exists`, 'true');
    
    console.log(`Successfully created user ${username} for Google ID ${googleId}`);
    return username;
  } catch (error) {
    console.error('Error creating Google user:', error);
    throw error;
  }
};

module.exports = {
  initializeGoogleSSO
};