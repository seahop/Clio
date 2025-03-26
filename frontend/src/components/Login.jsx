// Modified Login.jsx component
import React, { useState, useEffect } from 'react';
import LoginForm from './auth/LoginForm';
import PasswordChangeForm from './auth/PasswordChangeForm';

const Login = ({ onLoginSuccess, csrfToken }) => {
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [username, setUsername] = useState('');
  const [userRole, setUserRole] = useState('');
  const [error, setError] = useState('');

  // Check for stored password change requirement on mount
  useEffect(() => {
    const passwordChangeData = localStorage.getItem('passwordChangeRequired');
    if (passwordChangeData) {
      try {
        const { username, role } = JSON.parse(passwordChangeData);
        setUsername(username);
        setUserRole(role);
        setShowPasswordChange(true);
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
  }, []);

  const handleLoginSuccess = (userData) => {
    if (userData.requiresPasswordChange) {
      setShowPasswordChange(true);
      setUsername(userData.username);
      setUserRole(userData.role);
      
      // Store minimal user data for password change
      localStorage.setItem('passwordChangeRequired', JSON.stringify({
        username: userData.username,
        role: userData.role
      }));
    } else {
      // Remove any password change requirement data
      localStorage.removeItem('passwordChangeRequired');
      onLoginSuccess(userData);
    }
  };

  const handlePasswordChanged = (userData) => {
    // Clear password change requirement
    localStorage.removeItem('passwordChangeRequired');
    onLoginSuccess(userData);
  };

  if (showPasswordChange) {
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