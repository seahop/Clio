// frontend/src/components/auth/LoginForm.jsx
import React, { useState, useEffect } from 'react';
import { LogIn, AlertCircle } from 'lucide-react';
import { validateLoginInput } from '../../utils/passwordValidation';
import GoogleLoginButton from './GoogleLoginButton';
import OIDCLoginButton from './OIDCLoginButton';
import { BrandMark, Button } from '../common/ui';

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

  const inputClass = "block w-full px-3 py-2.5 rounded-md bg-surface-2 border border-line text-content " +
    "placeholder-faint text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors";

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-canvas py-12 px-4 overflow-hidden">
      {/* Ambient background: faint accent glow + grid, restrained */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-10%] h-[420px] w-[820px] -translate-x-1/2 rounded-full opacity-[0.14]"
             style={{ background: 'radial-gradient(closest-side, rgb(var(--c-accent)), transparent)' }} />
        <div className="absolute inset-0 opacity-[0.035]"
             style={{ backgroundImage: 'linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)', backgroundSize: '38px 38px' }} />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in-up">
        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-8">
          <BrandMark size={52} />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-content">Clio</h1>
          <p className="mt-1 text-sm text-muted">Red-team operations logging &amp; relation analysis</p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-line rounded-card shadow-pop p-6">
          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="space-y-3">
              <div>
                <label htmlFor="username" className="block text-2xs uppercase tracking-wider text-faint mb-1.5">Username</label>
                <input
                  id="username" name="username" type="text" required autoComplete="username"
                  className={inputClass} placeholder="analyst" value={username}
                  onChange={handleUsernameChange} maxLength={50}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-2xs uppercase tracking-wider text-faint mb-1.5">Password</label>
                <input
                  id="password" name="password" type="password" required autoComplete="current-password"
                  className={inputClass} placeholder="••••••••" value={password}
                  onChange={(e) => setPassword(e.target.value)} maxLength={128}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span className="whitespace-pre-line">{error}</span>
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" icon={LogIn}
              loading={loading} disabled={loading || !csrfToken} className="w-full">
              {loading ? 'Signing in…' : !csrfToken ? 'Initializing security…' : 'Sign in'}
            </Button>

            {hasSSOProviders && (
              <>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-line" /></div>
                  <div className="relative flex justify-center"><span className="px-3 bg-surface text-2xs uppercase tracking-wider text-faint">Or continue with</span></div>
                </div>
                <div className="space-y-3">
                  {providers.google && <GoogleLoginButton />}
                  {providers.oidc   && <OIDCLoginButton providerName={providers.oidcProviderName} />}
                </div>
              </>
            )}
          </form>
        </div>

        <p className="mt-6 text-center text-2xs uppercase tracking-wider text-faint">Authorized use only</p>
      </div>
    </div>
  );
};

export default LoginForm;
