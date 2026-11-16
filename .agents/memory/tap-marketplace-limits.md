---
name: Tap Marketplace onboarding limits
description: Provider requirements for seller split payouts and escrow-like flows.
---

This project's current Tap test flow only authorizes a buyer's test card; it does not pay a seller or provide escrow. Tap Marketplace split payouts require Tap's Marketplace approval and onboarding for each seller, including the required merchant identifiers and verification.

The user's real Tap account is connected but awaiting activation. Until activation, the website should offer a clearly labeled local payment simulation that does not send card data to Tap or imply a real authorization.

**Why:** Tap Marketplace has separate eligibility and onboarding requirements from its card tokenization and authorization APIs.

**How to apply:** Keep the local demo, Tap sandbox, and any future live mode separate. Never use live credentials for test flows. Do not promise seller payouts or escrow until the business completes Tap Marketplace onboarding and the order, capture, and settlement flows are implemented.
