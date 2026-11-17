# Ohda Build Report

**Report date:** 2026-11-17

## What was built

- An Arabic-first, right-to-left escrow MVP with responsive home, signup/login, deal creation and invitation, deal list/detail, profile, admin, and live in-person deal screens.
- Deal status updates, participant chat, ratings, waitlist interest, and the admin dispute/payout workflow backed by Supabase and row-level security.
- Test-only Tap and Stripe payment paths. Tap is configured for KWD; the current Stripe test checkout uses USD because the connected test account did not accept KWD.
- Seven SQL migrations are included under `supabase/migrations/` and were applied to the connected Supabase project.
- Email confirmation now returns to Ohda, shows a clear success state, and attempts to sign the user in automatically. The owner account has the admin role.

## Verification

- **Passed:** workspace TypeScript checks for the libraries, API server, Ohda app, mockup sandbox, and scripts.
- **Passed:** full workspace production build when the required build variables were supplied.
- **Passed:** Ohda production bundle generation. The login confirmation success state was also visually checked at a 375px viewport.
- **Passed:** the web workflow restarted and served the app.
- **Warning:** Vite reported that it could not resolve an original source-map location in `tooltip.tsx`; it did not prevent the build.
- **No automated test suite found:** the repository has no configured test command or test files.

## Failed or unfinished

- Running the workspace build without `PORT` failed because the mockup sandbox requires that variable. The full build passed after providing its build-time variables.
- Full two-user end-to-end checks remain unfinished: in-person and delivery deals, dispute resolution, cancellation, Tap test-card payment, and Stripe test-card payment have not all been verified with separate seller and buyer accounts.
- Tap and Stripe secret names are configured, but their values were not read or checked. End-to-end payment success and the test-key prefixes therefore remain unverified.
- This is a test-only prototype, not a live escrow service or real money custody system.

## Application environment variables

Names and presence only; values are intentionally omitted.

| Name | Status |
| --- | --- |
| `BASE_PATH` | Set for the verified build; not stored as a project secret |
| `BASE_URL` | Set by Vite |
| `DATABASE_URL` | Set; Replit-managed |
| `DEV` | Set by Vite |
| `LOG_LEVEL` | Not set; optional |
| `NODE_ENV` | Set for the verified build and API workflow |
| `PORT` | Set for the verified build and supplied by the runtime workflow |
| `REPL_ID` | Set; Replit-managed |
| `REPLIT_DEV_DOMAIN` | Set; Replit-managed |
| `REPLIT_DOMAINS` | Set; Replit-managed |
| `STRIPE_SECRET_KEY` | Set |
| `SUPABASE_ANON_KEY` | Set |
| `SUPABASE_URL` | Set |
| `TAP_PUBLIC_KEY` | Set |
| `TAP_SECRET_KEY` | Set |

`SESSION_SECRET` is set in Replit Secrets but is not referenced by the current application source.
