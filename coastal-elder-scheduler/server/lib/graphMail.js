// lib/graphMail.js
// Sends email via Microsoft Graph's /sendMail endpoint using OAuth 2.0
// client credentials flow (app-only auth). Deliberately NOT using SMTP AUTH
// with a username/password or app password — Microsoft is retiring Basic
// Auth for SMTP AUTH on Exchange Online (disabled by default for existing
// tenants by end of Dec 2026; app passwords stop working entirely as part
// of the same change). Client credentials + Graph sidesteps that completely
// and is the currently-recommended pattern for headless/backend senders.
//
// Requires, set up by the customer's M365 tenant admin:
//   1. An app registration in their Entra ID.
//   2. The Mail.Send APPLICATION permission (not delegated), with admin
//      consent granted.
//   3. A client secret (or certificate) for that app registration.
//   4. The shared mailbox (config.graph.sendAsMailbox) must exist, and the
//      app must be permitted to send as it (Mail.Send at the application
//      level allows sending as any mailbox in the tenant by default unless
//      scoped down with an application access policy — worth asking the
//      M365 admin to scope this to just the shared mailbox, as a
//      least-privilege practice).

const config = require('../config');
const { getAccessToken } = require('./graphClient');

/**
 * Sends a plain-text email via Graph, from the configured shared mailbox.
 * @param {Object} opts
 * @param {string|string[]} opts.to - recipient email(s)
 * @param {string} opts.subject
 * @param {string} opts.body - plain text body
 */
async function sendMail({ to, subject, body }) {
  const token = await getAccessToken();
  const toRecipients = (Array.isArray(to) ? to : [to]).map((address) => ({
    emailAddress: { address },
  }));

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.graph.sendAsMailbox)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'Text', content: body },
          toRecipients,
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Graph sendMail failed: ${res.status} ${errBody}`);
  }
}

module.exports = { sendMail };
