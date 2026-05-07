# Billing Policies — Acme Corp

## Billing cycle

Acme Corp charges on a monthly or annual cycle, on the anniversary of your
subscription start date. Your first charge happens immediately at checkout;
every subsequent charge is 30 or 365 days after the prior one, depending on
your plan.

Trial accounts are not charged until they convert to a paid subscription.
Expiring trials show a reminder banner 3 days, 1 day, and 1 hour before
expiration.

## Payment methods

We accept:

- **Credit / debit card** (Visa, Mastercard, American Express, Discover) for
  all plans.
- **ACH / bank transfer** for Business and Enterprise plans, invoiced monthly
  or quarterly.
- **Wire transfer** for annual Enterprise contracts on request.

We do not accept PayPal, cryptocurrency, or prepaid gift cards.

## Failed payments

If a payment fails, we retry the charge three times across 10 days
(days 1, 4, 10). After the third failure, the account enters **read-only
mode**: you can view data but cannot invite users, make API writes, or
generate new billing events.

Read-only mode is lifted within 5 minutes of a successful retry or a manual
payment-method update.

## Tax handling

Prices on our pricing page are listed exclusive of tax. Sales tax, VAT, or GST
is calculated at checkout based on your billing address and shown on the final
invoice. Enterprise contracts with tax-exempt status must submit a valid
exemption certificate to billing@acme.example within 30 days of contract
start.

## Proration

Upgrading mid-cycle prorates the difference and charges immediately.
Downgrading mid-cycle schedules the change to take effect at the next renewal
(no refund for the unused portion of the current cycle).

## Invoice delivery

Monthly invoices are emailed to the billing contact within 24 hours of each
successful charge. Historical invoices are available in
**Settings → Billing → Invoices** for 7 years.
