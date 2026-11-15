---
name: Tap Marketplace onboarding limits
description: Provider requirements for seller split payouts and escrow-like flows.
---

This project's current Tap test flow only authorizes a buyer's test card; it does not pay a seller or provide escrow. Tap Marketplace split payouts require Tap's Marketplace approval and onboarding for each seller, including the required merchant identifiers and verification.

**Why:** Tap Marketplace has separate eligibility and onboarding requirements from its card tokenization and authorization APIs.

**How to apply:** Keep the current flow clearly labeled as test-only. Do not promise seller payouts or escrow until the business completes Tap Marketplace onboarding and the order, capture, and settlement flows are implemented.
