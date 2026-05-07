# Integration Errors — Troubleshooting

Common errors you may hit when integrating with the Acme Corp API, and how
to resolve them.

## 401 Unauthorized

**Message:** `{"error": "invalid_api_key", "message": "The provided API key is invalid or has been revoked."}`

**Causes:**

- Key was revoked in **Settings → API Keys**
- Key was rotated and the old one is still in your code
- Key is correct but being sent in the wrong header (e.g., `X-API-Key` instead of `Authorization: Bearer`)
- Key is for production but you're calling the sandbox URL (or vice versa)

**Fix:** Verify the key in your dashboard, confirm the header format, and
confirm the key prefix (`acme_live_` or `acme_test_`) matches the base URL.

## 403 Forbidden

**Message:** `{"error": "insufficient_scope", "message": "This API key does not have permission for this operation."}`

**Causes:**

- API key is scoped to read-only access but you're making a write call
- Account plan doesn't include the feature (Enterprise-only endpoints)

**Fix:** Check the key's scopes in **Settings → API Keys → [key name] →
Scopes**. Create a new key with wider scope if needed.

## 429 Too Many Requests

**Message:** `{"error": "rate_limit_exceeded"}` + `Retry-After: N` header.

**Fix:** Back off for the number of seconds in `Retry-After`. Consider
implementing exponential backoff + jitter in your SDK wrapper. For
sustained high volume, contact sales@acme.example about rate-limit increases.

## 500 Internal Server Error

**Message:** Usually a generic `{"error": "server_error"}`.

**Causes:** Transient platform issues.

**Fix:** Retry with exponential backoff (1s → 2s → 4s → 8s, up to 5
attempts). If the error persists across retries, check our status page at
status.acme.example and open a ticket with the `X-Request-Id` header from
the failed response.

## Webhook Delivery Failures

**Symptom:** Events show "Failed" in **Settings → Webhooks → Delivery Log**.

**Causes:**

- Your webhook endpoint returned a non-2xx status code
- Your endpoint took longer than 10 seconds to respond
- TLS certificate on your endpoint expired or is invalid
- Your endpoint rejected the request body format

**Fix:**

1. Check your server logs for the `POST` from our IP range (listed in
   **Settings → Webhooks → IP Allowlist**).
2. Verify the endpoint returns 2xx within 10 seconds.
3. Inspect the payload in our Delivery Log; the body we sent is always
   preserved for 72 hours.
4. Use the "Retry delivery" button in Delivery Log to manually re-send.

## CORS errors (browser-side integrations)

**Symptom:** Browser console shows
`No 'Access-Control-Allow-Origin' header is present on the requested resource.`

**Fix:** The Acme API does not support browser-to-API calls. Any
client-side request must proxy through your server. See the "Browser
integration patterns" page for recommended architectures.
