// Modified Login.jsx component with fixes for Google SSO handling
import React, { useState, useEffect } from 'react';
import LoginForm from './auth/LoginForm';
import PasswordChangeForm from './auth/PasswordChangeForm';

const Login = ({ onLoginSuccess, csrfToken }) => {
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [username, setUsername] = useState('');
  const [userRole, setUserRole] = useState('');
  const [error, setError] = useState('');
  const [isGoogleAuth, setIsGoogleAuth] = useState(false);

  // Check for stored password change requirement on mount
  useEffect(() => {
    const passwordChangeData = localStorage.getItem('passwordChangeRequired');
    if (passwordChangeData) {
      try {
        const parsedData = JSON.parse(passwordChangeData);
        const { username, role, isGoogleSSO } = parsedData;
        
        // Skip password change if the user authenticated via Google SSO
        if (isGoogleSSO === true) {
          console.log('Google SSO user detected - skipping password change');
          localStorage.removeItem('passwordChangeRequired');
          // Try to get the full user data from localStorage
          const userData = localStorage.getItem('user');
          if (userData) {
            const parsedUserData = JSON.parse(userData);
            // Ensure the Google SSO flag is set
            parsedUserData.isGoogleSSO = true;
            parsedUserData.requiresPasswordChange = false;
            onLoginSuccess(parsedUserData);
          } else {
            // Fallback with minimal data if full user data isn't available
            onLoginSuccess({ 
              username, 
              role, 
              requiresPasswordChange: false,
              isGoogleSSO: true 
            });
          }
          return;
        }
        
        setUsername(username);
        setUserRole(role);
        setShowPasswordChange(true);
        setIsGoogleAuth(!!isGoogleSSO);
      } catch (error) {
        console.error('Error parsing password change data:', error);
        localStorage.removeItem('passwordChangeRequired');
      }
    }

    // Check for error parameters in URL on mount
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    
    if (errorParam === 'google_auth_failed') {
      setError('Google authentication failed. Please try again or use username/password login.');
    }
  }, [onLoginSuccess]);

  const handleLoginSuccess = (userData) => {
    // Check if this is a Google SSO user (might be set in the userData)
    const isGoogleSSO = userData.isGoogleSSO === true;
    
    if (userData.requiresPasswordChange && !isGoogleSSO) {
      setShowPasswordChange(true);
      setUsername(userData.username);
      setUserRole(userData.role);
      setIsGoogleAuth(isGoogleSSO);
      
      // Store minimal user data for password change
      localStorage.setItem('passwordChangeRequired', JSON.stringify({
        username: userData.username,
        role: userData.role,
        isGoogleSSO
      }));
    } else {
      // Remove any password change requirement data
      localStorage.removeItem('passwordChangeRequired');
      
      // Always ensure Google SSO flag persists in localStorage
      if (isGoogleSSO) {
        userData.isGoogleSSO = true;
        userData.requiresPasswordChange = false;
      }
      
      // Store updated user data
      localStorage.setItem('user', JSON.stringify(userData));
      onLoginSuccess(userData);
    }
  };

  const handlePasswordChanged = (userData) => {
    // Clear password change requirement
    localStorage.removeItem('passwordChangeRequired');
    onLoginSuccess(userData);
  };

  if (showPasswordChange && !isGoogleAuth) {
    return (
      <PasswordChangeForm 
        username={username}
        onPasswordChanged={handlePasswordChanged}
        csrfToken={csrfToken}
      />
    );
  }

  return (
    <LoginForm
      onLoginSuccess={handleLoginSuccess}
      csrfToken={csrfToken}
      initialError={error}
    />
  );
};

export default Login;