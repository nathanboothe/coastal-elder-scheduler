// lib/graphClient.js
// Shared OAuth 2.0 client-credentials token acquisition for Microsoft Graph.
// Extracted out of graphMail.js so graphDirectory.js (elder/group sync) can
// reuse the same cached token instead of requesting its own — same app
// registration, same tenant, same '.default' scope, so there's no reason
// for two independent caches.

const config = require('../config');

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${config.graph.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.graph.clientId,
    client_secret: config.graph.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to acquire Graph token: ${res.status} ${errBody}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiresAt = now + data.expires_in * 1000;
  return cachedToken;
}

/** Convenience wrapper: authenticated fetch against Graph's v1.0 endpoint. */
async function graphFetch(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Graph API error ${res.status} on ${path}: ${errBody}`);
  }

  // Some Graph calls (e.g. sendMail) return 202 with no body.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

module.exports = { getAccessToken, graphFetch };
