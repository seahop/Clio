// Modified Login.jsx component with fixes for Google SSO handling
import React, { useState, useEffect } from 'react';
import LoginForm from './auth/LoginForm';
import PasswordChangeForm from './auth/PasswordChangeForm';

const Login = ({ onLoginSuccess, csrfToken }) => {
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [username, setUsername] = useState('');
  const [userRole, setUserRole] = useState('');
  const [error, setError] = useState('');
  const [isSSOAuth, setIsSSOAuth] = useState(false);

  // Check for stored password change requirement on mount
  useEffect(() => {
    const passwordChangeData = localStorage.getItem('passwordChangeRequired');
    if (passwordChangeData) {
      try {
        const parsedData = JSON.parse(passwordChangeData);
        const { username, role, isGoogleSSO, isOIDCSSO } = parsedData;

        // Skip password change for any SSO user
        const isSSOUser = isGoogleSSO === true || isOIDCSSO === true;
        if (isSSOUser) {
          localStorage.removeItem('passwordChangeRequired');
          const stored = localStorage.getItem('user');
          if (stored) {
            const parsed = JSON.parse(stored);
            parsed.requiresPasswordChange = false;
            onLoginSuccess(parsed);
          } else {
            onLoginSuccess({ username, role, requiresPasswordChange: false, isGoogleSSO, isOIDCSSO });
          }
          return;
        }

        setUsername(username);
        setUserRole(role);
        setShowPasswordChange(true);
        setIsSSOAuth(!!(isGoogleSSO || isOIDCSSO));
      } catch (error) {
        console.error('Error parsing password change data:', error);
        localStorage.removeItem('passwordChangeRequired');
      }
    }

    // Show errors returned via URL query params (Google / OIDC failure redirects)
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');

    if (errorParam === 'google_auth_failed') {
      setError('Google authentication failed. Please try again or use username/password login.');
    } else if (errorParam === 'oidc_auth_failed') {
      setError('SSO authentication failed. Please try again or use username/password login.');
    }
  }, [onLoginSuccess]);

  const handleLoginSuccess = (userData) => {
    const isGoogleSSO = userData.isGoogleSSO === true;
    const isOIDCSSO   = userData.isOIDCSSO === true;
    const isSSOUser   = isGoogleSSO || isOIDCSSO;

    if (userData.requiresPasswordChange && !isSSOUser) {
      setShowPasswordChange(true);
      setUsername(userData.username);
      setUserRole(userData.role);
      setIsSSOAuth(isSSOUser);

      localStorage.setItem('passwordChangeRequired', JSON.stringify({
        username: userData.username,
        role: userData.role,
        isGoogleSSO,
        isOIDCSSO,
      }));
    } else {
      localStorage.removeItem('passwordChangeRequired');

      if (isSSOUser) {
        userData.requiresPasswordChange = false;
      }

      localStorage.setItem('user', JSON.stringify(userData));
      onLoginSuccess(userData);
    }
  };

  const handlePasswordChanged = (userData) => {
    // Clear password change requirement
    localStorage.removeItem('passwordChangeRequired');
    onLoginSuccess(userData);
  };

  if (showPasswordChange && !isSSOAuth) {
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