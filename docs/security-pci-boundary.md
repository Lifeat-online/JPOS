# Jimmy POS Security and PCI Boundary

Last updated: 2026-06-05

## Card Data Boundary

Jimmy POS does not store, log, export, or intentionally accept raw cardholder data:

- No PAN/card number
- No CVV/CVC/security code
- No magnetic stripe track data
- No card expiry date
- No card PIN

The application stores only operational payment evidence needed for reconciliation:

- Payment method
- Provider name, such as PayFast, Yoco, SnapScan, PayJustNow, Mobicred, or PayFlex
- Provider device or terminal reference
- Provider transaction/reference ID
- Authorization code when supplied by the provider
- Provider status, such as pending, approved, settled, failed, reversed, refunded, or partial refund
- Manager notes that have passed provider-evidence validation

Backend validation rejects provider evidence that appears to contain PAN, CVV/CVC, track data, or non-provider token payloads before sale-payment persistence.

## Hosted Deployment Boundary

In the hosted Jimmy POS deployment, the app stays outside card-data storage by using external payment rails:

- PayFast hosted checkout/notify callbacks
- External card terminal capture with provider/device/reference evidence only
- QR/mobile-wallet provider references
- BNPL provider approval/reference evidence

Hosted operators must configure TLS termination, database credentials, JWT secrets, PayFast/provider credentials, firewall rules, backups, monitoring, and log rotation according to `docs/production-hardening-checklist.md`.

## CSRF and Session Strategy

Current Jimmy POS API authentication uses bearer tokens in the `Authorization` header, not ambient cookie authentication. Because browsers do not automatically attach bearer tokens to cross-site form posts, the current API boundary does not rely on cookie CSRF defenses.

If cookie-based auth is introduced later, the release must add both:

- `HttpOnly`, `Secure`, and `SameSite=Lax` or `SameSite=Strict` session cookies.
- A CSRF token check on state-changing routes, including sale creation/update, refund/void, stock mutation, settings mutation, payment/provider callbacks where applicable, AI-provider tests, and login/setup flows.

Cookie auth must not be enabled until these controls are tested.

## Self-Hosted Deployment Boundary

In self-hosted deployments, the business operating Jimmy POS is responsible for the surrounding environment:

- Use certified payment providers or standalone card terminals for card acceptance.
- Do not connect raw card readers that send PAN/CVV into Jimmy POS fields.
- Do not paste card numbers, CVV/CVC, card expiry, or track data into notes, references, provider fields, customer notes, support messages, or logs.
- Keep the POS app, database, reverse proxy, and operating system patched.
- Store provider credentials only in environment variables or secret managers.
- Restrict database/admin access to authorized operators.
- Keep backups encrypted and access-controlled.

If a self-hosted operator changes the payment flow to directly process cardholder data, that operator must complete a separate PCI DSS assessment for that new card-data environment. That flow is outside the supported Jimmy POS boundary.

## Logging Boundary

Security error logs are emitted as structured JSON with request ID, method, path, IP, staff ID, public error message, and redacted details. Token, password, API key, secret, cookie, CVV/CVC, and card-number-like values are redacted before logging.

## Regression Evidence

Current test coverage for this boundary includes:

- `tests/backend/payment-provider-boundary.test.ts`
- `tests/backend/payment-reports.test.ts`
- `tests/backend/validation.test.ts`
- `tests/backend/security-hardening.test.ts`
