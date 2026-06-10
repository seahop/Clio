// backend/lib/ssoRedirect.js
// Finishes an SSO login with a same-origin interstitial page instead of a 302.
//
// A 302 here would be the tail of the cross-site redirect chain that started
// at the identity provider, and browsers do not send SameSite=Strict cookies
// (token / auth_token) on document requests that are part of such a chain.
// The meta-refresh breaks the chain: the follow-up navigation is initiated by
// this page on our own origin, so Strict cookies flow normally.
//
// Implemented with <meta http-equiv="refresh"> rather than an inline <script>
// because the backend's CSP only allows script-src 'self'.
const completeLoginRedirect = (res, target) => {
  res.status(200).type('html').send(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="refresh" content="0;url=${target}">` +
    '<title>Signing in…</title></head>' +
    `<body><p>Signing you in… <a href="${target}">Continue</a></p></body></html>`
  );
};

module.exports = { completeLoginRedirect };
