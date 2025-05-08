// Modified GoogleLoginButton.jsx

import React from 'react';

const GoogleLoginButton = () => {
  const handleGoogleLogin = () => {
    // Set a flag in localStorage to indicate a Google SSO authentication attempt
    // This helps the frontend know this is a Google authentication even if
    // there are redirects or page reloads in the process
    localStorage.setItem('googleSSOAttempt', 'true');
    
    // Also clear any existing passwordChangeRequired flags as Google SSO users
    // should never see the password change screen
    localStorage.removeItem('passwordChangeRequired');
    
    // Redirect to the Google auth endpoint
    window.location.href = '/api/auth/google';
  };

  // Check for Google auth parameter in URL (for redirects from Google auth)
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authParam = urlParams.get('auth');
    
    if (authParam === 'google') {
      // We've been redirected from a Google auth, ensure the flag is set
      console.log('Detected Google auth redirect');
      localStorage.setItem('googleSSOAttempt', 'true');
      
      // Clean up the URL
      if (window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('auth');
        window.history.replaceState({}, document.title, url.toString());
      }
    }
  }, []);

  return (
    <button
      onClick={handleGoogleLogin}
      className="w-full flex justify-center items-center gap-2 py-2 px-4 border border-gray-600 rounded-md bg-white hover:bg-gray-100 transition-colors"
      type="button"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
      <span className="text-gray-800 font-medium">Sign in with Google</span>
    </button>
  );
};

export default GoogleLoginButton;