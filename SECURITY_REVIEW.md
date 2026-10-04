# Security review — 4 October 2026

This source review covers the Node HTTP server, administrative authentication,
notification and tracking routes, scraper network requests, and frontend link
rendering. Changes are local; deployment was not performed.

## Findings addressed

| Risk | Finding | Fix |
| --- | --- | --- |
| High | Signed admin tokens were accepted when MongoDB was unavailable or revocation lookup failed. Session issuance also ignored persistence failures. | Require a reachable session store, a stored non-revoked session, and successful persistence. Rotation atomically revokes the old record and rejects replay. |
| High | A publicly known fallback signing secret could permit forged tokens during a session-store outage. | Remove the fixed fallback, validate required token claims, and reject tokens when session lookup is unavailable. |
| High | Email-address filters exposed candidate tracking and notification history; status, unsubscribe, timer and reminder operations lacked ownership checks. | Require administrative permissions on all these routes, including database telemetry aliases and timer enumeration. |
| High | Public resubscription and re-tracking could overwrite another candidate's preferences or reactivate their reminders. | Require server-verified administrative authorization to modify existing records. Do not return subscriber history from the public subscription response. |
| High | Allowed scraper destinations could redirect to internal services, or resolve to private addresses. | Disable redirects and proxies; check DNS results in the socket lookup, reject private/special addresses, and cap response size. Reject URL credentials and nonstandard ports at the details endpoint. |
| Medium | Escaping HTML did not prevent executable URL schemes in links; preview URLs and admin record IDs were inserted without attribute escaping. | Validate HTTP/HTTPS URLs before attribute escaping and escape admin IDs. Remove interpolated error HTML from the status route. |
| Medium | Authentication had no request limiter, and public rate limits trusted spoofable forwarding headers. | Rate-limit authentication and details requests; use the socket address locally and Vercel's platform header only on Vercel. Bound rate-limit and details-cache maps. |
| Medium | Admin credentials were accepted in query strings, exposing secrets to URL logs/history. | Accept authentication headers only; mark API responses `no-store`; remove wildcard CORS. Compare master and cron secrets with constant-time digest comparison. |
| Latent | Exported registration service allowed unauthenticated first-admin bootstrap. No current HTTP route exposes it. | Require the master key for every admin registration. |

## Behavior and configuration

- Candidate history, status links in emails, unsubscribe, timer controls, and
  changes to existing preferences now require admin authorization. Existing
  candidate UI and email links will receive authorization errors. A secure
  self-service flow must verify email ownership before issuing scoped access.
- New subscriptions and new tracked jobs remain public and rate-limited. Custom
  automatic test timers require admin dispatch permission.
- Use `Authorization: Bearer <session-token>` or `x-admin-key`; URL parameters
  `token` and `adminKey` no longer authenticate.
- Set a strong `SESSION_SECRET` and `ADMIN_API_KEY` consistently across server
  instances. MongoDB outages now prevent session login/validation. Explicit
  master-key authentication remains an administrative recovery mechanism.
- Frontend and API use the same origin. Separate-origin clients need an explicit
  reviewed CORS allowlist.
- Scraper redirects are intentionally rejected; redirected source pages may
  need their canonical URLs configured.

## Validation

- `node --test backend/test/security.test.js`: 9 tests passed, covering HTTP
  authorization, URL credentials, forwarding-header spoofing, missing/failed/
  revoked session stores, token rotation replay, failed session persistence,
  first-admin authorization, existing subscription protection, private DNS
  answers, and executable frontend URL schemes.
- Changed JavaScript passed Node syntax checks; `git diff --check` passed.
- `npm.cmd audit --omit=dev --json`: zero known production dependency advisories
  reported by npm at review time. Development dependencies were not audited.

## Remaining limits

This is a targeted source review, not a penetration-test certification. Tests
use mocked MongoDB and local HTTP requests; no production database, email
dispatch, deployed Vercel configuration, or browser workflow was exercised.

Public enrollment still needs email double opt-in to prevent third-party
enrollment and unwanted email. Rate limits are per process, so a shared store
or platform limits are needed across serverless instances. Production TLS,
secret rotation, deployment permissions, and broader content-security-policy
hardening remain deployment considerations.

Reference: Axios documents redirect behavior and controls in its
[official request configuration](https://github.com/axios/axios/blob/v1.x/docs/pages/advanced/request-config.md).
Node documents secret-comparison practices in its
[security guidance](https://github.com/nodejs/learn/blob/main/pages/getting-started/security-best-practices.md).
