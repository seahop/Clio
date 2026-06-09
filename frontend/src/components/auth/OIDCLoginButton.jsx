import React from 'react';

const OIDCLoginButton = ({ providerName = 'SSO' }) => {
  const handleOIDCLogin = () => {
    window.location.href = '/api/auth/oidc';
  };

  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'oidc') {
      if (window.history?.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('auth');
        window.history.replaceState({}, document.title, url.toString());
      }
    }
  }, []);

  return (
    <button
      onClick={handleOIDCLogin}
      className="w-full flex justify-center items-center gap-2 py-2 px-4 border border-gray-500 rounded-md bg-gray-700 hover:bg-gray-600 text-white transition-colors"
      type="button"
    >
      {/* Generic key/lock icon */}
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span className="font-medium">Sign in with {providerName}</span>
    </button>
  );
};

export default OIDCLoginButton;
