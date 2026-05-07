# Plans & Pricing

Acme Corp offers three tiers plus custom Enterprise contracts.

## Starter — $29 / month ($290 / year)

For individuals and small teams evaluating the platform.

Includes:

- Up to 3 team members
- 10,000 API requests per month
- 50 MB of storage
- Community support (forum, Discord)
- Sandbox access
- All core features

Limits:

- No custom domain
- No SSO
- No SLA

## Business — $149 / month ($1,490 / year)

For teams shipping to customers.

Everything in Starter, plus:

- Unlimited team members
- 500,000 API requests per month
- 50 GB of storage
- Email support (response within 1 business day)
- 99.9% uptime SLA
- Custom domain
- Webhook delivery log (30-day retention)
- Audit log (90-day retention)

## Enterprise — custom pricing

For organizations requiring advanced security, compliance, and scale.

Everything in Business, plus:

- Negotiable API request volume
- Negotiable storage
- Dedicated Slack channel + Account Executive
- 99.99% uptime SLA with credits
- SSO (SAML 2.0, OIDC)
- SCIM user provisioning
- Single-tenant deployment option
- Audit log (unlimited retention)
- DPA + custom security review
- Vendor onboarding assistance

Contact sales@acme.example to discuss pricing. Typical contracts start at
$30,000 / year.

## How billing counts "API requests"

Each HTTP call to `api.acme.example/v2/*` counts as one request, including
failed requests (4xx, 5xx). Webhook deliveries do NOT count against your
quota. Sandbox requests do NOT count against your quota.

## Storage pricing

Starter includes 50 MB. Business includes 50 GB. Beyond the plan limit,
storage costs **$0.10 per GB per month**, billed monthly.

## Volume discounts

Business plan customers using more than 2 million requests per month
qualify for a 20% discount on overage charges. Contact billing@acme.example
to apply.

## Non-profit / education discount

Registered non-profits and accredited educational institutions get 50% off
any plan. Email discount@acme.example with proof of status.
