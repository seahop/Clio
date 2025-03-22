# Google SSO Integration for Clio

This document outlines how to set up and use Google SSO (Single Sign-On) with the Clio Logging Platform.

## Table of Contents
- [Overview](#overview)
- [Google Cloud Console Setup](#google-cloud-console-setup)
- [Generating Environment Configuration](#generating-environment-configuration)
- [Using with Ngrok for Development](#using-with-ngrok-for-development)
- [How It Works](#how-it-works)
- [Troubleshooting](#troubleshooting)

## Overview

Clio now supports Google Single Sign-On (SSO) as an authentication method. This allows users to sign in using their Google accounts, eliminating the need to create and remember separate credentials for Clio.

**Key Benefits:**
- Simplified login experience
- Reduced password management burden
- Enhanced security through Google's authentication infrastructure
- Automatic user creation based on Google profiles

## Google Cloud Console Setup

Before configuring Google SSO in Clio, you need to set up OAuth 2.0 credentials in the Google Cloud Console:

1. **Create a Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one

2. **Configure OAuth Consent Screen**:
   - Navigate to "APIs & Services" > "OAuth consent screen"
   - Select "External" (for testing) or "Internal" (for organization use)
   - Fill in the required app information (name, contact email, etc.)
   - Add scopes for `email` and `profile`
   - Add test users if using External user type
   - Save and continue

3. **Create OAuth Credentials**:
   - Navigate to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Select "Web application" as the application type
   - Name your OAuth client
   - Add Authorized JavaScript origins:
     - Standard setup: `https://your-hostname:3000`
     - Ngrok setup: `https://your-subdomain.ngrok-free.app` (no port)
   - Add Authorized redirect URIs:
     - Standard setup: `https://your-hostname:3000/api/auth/google/callback`
     - Ngrok setup: `https://your-subdomain.ngrok-free.app/api/auth/google/callback` (no port)
   - Click "Create"

4. **Note Your Credentials**:
   - Once created, note your **Client ID** and **Client Secret**
   - These values will be needed when running the environment setup script

## Generating Environment Configuration

The `generate-env.py` script now supports Google SSO configuration with the following options:

```bash
python3 generate-env.py [frontend_url] --google-client-id=CLIENT_ID --google-client-secret=CLIENT_SECRET [--google-callback-url=CALLBACK_URL]
```

**Parameters**:

- `frontend_url`: The URL where your application will be accessible. This determines the domain/IP used for certificate generation and application configuration.
- `--google-client-id`: Your Google OAuth Client ID from Google Cloud Console
- `--google-client-secret`: Your Google OAuth Client Secret from Google Cloud Console
- `--google-callback-url`: (Optional) The full URL where Google should redirect after authentication. This is often your ngrok URL for development.

**Important**: The `frontend_url` and `google-callback-url` serve different purposes:
- `frontend_url` is for certificate generation and core application configuration
- `google-callback-url` is specifically for Google OAuth redirects

**Examples**:

1. **Local development setup**:
   ```bash
   python3 generate-env.py https://localhost:3000 --google-client-id=123456789.apps.googleusercontent.com --google-client-secret=abcdef123456
   ```

2. **Setup with IP address (for local network access)**:
   ```bash
   python3 generate-env.py https://192.168.1.113:3000 --google-client-id=123456789.apps.googleusercontent.com --google-client-secret=abcdef123456
   ```

3. **Setup with IP and ngrok for Google Auth**:
   ```bash
   python3 generate-env.py https://192.168.1.113:3000 --google-client-id=123456789.apps.googleusercontent.com --google-client-secret=abcdef123456 --google-callback-url=https://your-subdomain.ngrok-free.app/api/auth/google/callback
   ```

4. **Production setup with custom domain**:
   ```bash
   python3 generate-env.py https://clio.example.com:3000 --google-client-id=123456789.apps.googleusercontent.com --google-client-secret=abcdef123456
   ```

If you don't specify a callback URL, the script will automatically generate one based on your frontend URL's hostname, which works for local development but not with ngrok tunnels.

## Using with Ngrok for Development

Ngrok is useful for exposing your local development environment to the internet, which allows Google OAuth to work with your local setup. For Google authentication to work properly, Google needs to be able to redirect to your application after authentication, which requires a publicly accessible URL.

### Step-by-Step Ngrok Setup

1. **Start ngrok pointing to port 3000**:
   ```bash
   ngrok http https://yourIPorHostname:3000
   ```
   
   For a more consistent experience, use a fixed subdomain (requires ngrok account):
   ```bash
   ngrok http https://yourIPorHostname:3000 --subdomain=your-subdomain
   ```

2. **Note your ngrok URL** (e.g., `https://abcd-123-45-67-89.ngrok-free.app`)

3. **Update Google Cloud Console with your ngrok URL**:
   - Set JavaScript origin to: `https://your-subdomain.ngrok-free.app` (no port)
   - Set redirect URI to: `https://your-subdomain.ngrok-free.app/api/auth/google/callback` (no port)

4. **Generate your environment with your local IP/hostname and ngrok callback URL**:
   ```bash
   python3 generate-env.py https://192.168.1.1:3000 --google-client-id=YOUR_CLIENT_ID --google-client-secret=YOUR_CLIENT_SECRET --google-callback-url=https://your-subdomain.ngrok-free.app/api/auth/google/callback
   ```

   Note: The first URL is your local IP/hostname, while the callback URL is your ngrok URL.

5. **Start your Clio application**:
   ```bash
   docker-compose up --build
   ```

6. **Access your application** through the ngrok URL in your browser

### Ngrok Command Specifics

When starting ngrok, you can use either:

```bash
# Basic usage - just specify the port
ngrok http 3000
```

Or, for a system where your Clio is configured with a specific local IP:

```bash
# Point to specific IP and port
ngrok http https://192.168.1.1:3000
```

Both approaches will work, but the first one is simpler and usually sufficient.

### Working Example

Here's a complete working example with the correct order of operations:

```bash
# 1. Start ngrok
ngrok http https://192.168.1.1:3000

# 2. Get your ngrok URL (e.g., https://abcd-123-45-67-89.ngrok-free.app)
# 3. Set this URL in Google Cloud Console for JavaScript origin and redirect URI
The Javascript origin might look like this:https://abcd-123-45-67-89.ngrok-free.app
The Redirect URL might look like this: https://abcd-123-45-67-89.ngrok-free.app/api/auth/google/callback

# 4. Generate environment with local IP and ngrok callback
python3 generate-env.py https://192.168.1.1:3000 --google-client-id=123456789.apps.googleusercontent.com --google-client-secret=GOCSPX-abcdefghijklmno --google-callback-url=https://abcd-123-45-67-89.ngrok-free.app/api/auth/google/callback

# 5. Start the application
docker-compose up --build

# 6. Access via your ngrok URL in the browser
```

### Important Notes for Ngrok Usage

- **Do not include the port** in your ngrok URL configurations in Google Cloud Console
- Ngrok URLs expire unless you have a paid plan with fixed subdomains
- Every time your ngrok URL changes, you need to:
  1. Update the redirect URI in Google Cloud Console
  2. Re-run `generate-env.py` with the new ngrok URL as the callback URL
  3. Restart your application
- The ngrok tunnel must be running whenever you want to use Google SSO
- Remember: Your local setup URL (first parameter) and Google callback URL (optional parameter) serve different purposes:
  - The local URL (e.g., `https://192.168.1.1:3000`) is for certificate generation and where your application runs
  - The callback URL (e.g., `https://abcd-123-45-67-89.ngrok-free.app/api/auth/google/callback`) is where Google redirects after authentication

## How It Works

1. **User clicks "Sign in with Google"** on the Clio login page
2. User is redirected to Google's authentication page
3. After successful Google authentication, user is redirected back to Clio
4. If it's the user's first time, a new account is automatically created
5. User is logged in and a session is created

**User Creation Logic**:
- A username is generated from the user's Google email (e.g., johndoe@gmail.com → johndoe)
- If the username already exists, a number is appended (e.g., johndoe1, johndoe2)
- Google SSO users are always created with regular user permissions, never admin
- The Google account ID is linked to the Clio username for future logins

## Troubleshooting

**Common Issues**:

1. **"Error: redirect_uri_mismatch"**
   - Ensure the callback URL in Google Cloud Console exactly matches what's configured in Clio
   - For ngrok, make sure you're not including the port in Google Cloud Console

2. **"Error: invalid_client"**
   - Double-check that your Client ID and Client Secret are correct
   - Make sure the OAuth consent screen is properly configured

3. **"Failed to initialize Google SSO"**
   - Check if your environment variables are correctly set in the .env file
   - Verify that Google Client ID and Secret values are not empty

4. **"Google authentication failed" message on login page**
   - Check the backend logs for detailed error information
   - Verify network connectivity between your server and Google's authentication servers
   - Ensure your server's time is correctly synchronized (OAuth requires accurate time)

If you encounter persistent issues, check the server logs for more detailed error messages.