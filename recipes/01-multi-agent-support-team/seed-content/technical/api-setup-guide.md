# API Setup Guide

This guide walks you through making your first API call to Acme Corp.

## 1. Get your API key

Go to **Settings → API Keys**. Create a new key, give it a memorable name,
and copy it immediately — the key is shown only once and cannot be retrieved
later.

Keys are prefixed with `acme_live_` or `acme_test_`. Use test keys while
developing; they run against an isolated sandbox environment with no billing
impact.

## 2. Choose your base URL

| Environment | Base URL |
|---|---|
| Production | `https://api.acme.example/v2` |
| Sandbox | `https://api-sandbox.acme.example/v2` |

Sandbox data is isolated per-account and reset every 30 days.

## 3. Authenticate

Pass the API key as a bearer token in the `Authorization` header:

```
curl https://api.acme.example/v2/widgets \
  -H "Authorization: Bearer acme_live_xxxxxxxxxxxxxxxx"
```

Never send the key in the URL query string — it will appear in server logs
and is a security risk.

## 4. Make your first request

The simplest endpoint is `GET /v2/widgets` which lists up to 50 widgets for
your account:

```
curl -s https://api.acme.example/v2/widgets \
  -H "Authorization: Bearer acme_test_..." | jq
```

Expected response (sandbox accounts start empty):

```json
{
  "data": [],
  "has_more": false,
  "next_cursor": null
}
```

## 5. Pagination

List endpoints return up to 50 rows at a time. If `has_more` is `true`, pass
`next_cursor` in the `cursor` query param on your next call:

```
curl "https://api.acme.example/v2/widgets?cursor=c_abc123" \
  -H "Authorization: Bearer acme_test_..."
```

## 6. Rate limits

| Plan | Requests per minute |
|---|---|
| Starter | 60 |
| Business | 600 |
| Enterprise | 6000 |

Responses include `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers.
Exceeding the limit returns HTTP 429 with a `Retry-After` header.

## 7. Webhooks

Configure webhooks in **Settings → Webhooks** to receive real-time events.
Webhooks retry with exponential backoff for up to 24 hours on any non-2xx
response.

## SDKs

Official libraries are available for Node.js, Python, Ruby, Go, PHP, and
.NET. See the Integrations page for installation instructions.
