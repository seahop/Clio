// frontend/src/components/auth/LoginForm.jsx
import React, { useState, useEffect } from 'react';
import { LogIn } from 'lucide-react';
import { validateLoginInput } from '../../utils/passwordValidation';
import GoogleLoginButton from './GoogleLoginButton';
import OIDCLoginButton from './OIDCLoginButton';

const LoginForm = ({ onLoginSuccess, csrfToken, initialError = '' }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [loading, setIsLoading] = useState(false);
  const [providers, setProviders] = useState({ google: false, oidc: false, oidcProviderName: 'SSO' });

  // Fetch which SSO providers are configured so we show only relevant buttons
  useEffect(() => {
    fetch('/api/auth/providers', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setProviders(data); })
      .catch(() => {}); // non-fatal — buttons just stay hidden
  }, []);

  // Keep the error in sync if the parent updates initialError after mount
  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  const handleLogin = async (e) => {
    e.preventDefault();
    window.csrfToken = csrfToken;
    if (!csrfToken) {
      setError('Security token not available. Please refresh the page.');
      return;
    }

    const validationErrors = validateLoginInput(username, password);
    if (validationErrors.length > 0) {
      setError(validationErrors.join('\n'));
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(`/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        throw new Error('Invalid response from server. Please try again.');
      }

      if (!response.ok) throw new Error(data.error || 'Login failed');

      if (data.user.requiresPasswordChange) {
        localStorage.setItem('passwordChangeRequired', JSON.stringify({
          username: data.user.username,
          role: data.user.role,
        }));
        onLoginSuccess(data.user);
      } else {
        localStorage.removeItem('passwordChangeRequired');
        localStorage.setItem('user', JSON.stringify(data.user));
        onLoginSuccess(data.user);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to connect to server. Please check your network connection.');
      await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUsernameChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^[a-zA-Z0-9_-]*$/.test(value)) {
      setUsername(value);
    }
  };

  const hasSSOProviders = providers.google || providers.oidc;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            Clio Logging Platform
          </h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            Please sign in to continue
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                required
                autoComplete="username"
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm bg-gray-700"
                placeholder="Username"
                value={username}
                onChange={handleUsernameChange}
                maxLength={50}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm bg-gray-700"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={128}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading || !csrfToken}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                <LogIn className="h-5 w-5 text-blue-500 group-hover:text-blue-400" />
              </span>
              {loading ? 'Signing in...' :
               !csrfToken ? 'Initializing security...' :
               'Sign in'}
            </button>
            {!csrfToken && (
              <p className="mt-2 text-sm text-center text-gray-400">
                Please wait while security is initialized...
              </p>
            )}
          </div>

          {hasSSOProviders && (
            <>
              <div className="mt-5 relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-gray-900 text-gray-400">Or continue with</span>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {providers.google && <GoogleLoginButton />}
                {providers.oidc   && <OIDCLoginButton providerName={providers.oidcProviderName} />}
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default LoginForm;
