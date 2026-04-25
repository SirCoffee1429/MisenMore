---
name: Postmark multi-tenant routing plan + current TEST_ORG_ID hack
description: Plus-addressing via organizations.inbound_email_key is the chosen Phase 8 design; process-sales-data and process-banquets currently stamp a hardcoded TEST_ORG_ID
type: project
---

**Final design (Phase 8):** Plus-addressing.

- Single Postmark inbound address: `sales@parse.misenmore.com` (or similar)
- Each org has `organizations.inbound_email_key` (32-char random, already added
  in the unapplied Phase 8 migration tree per Phase 6 notes)
- Org sets up email forwarding rule: forward sales report email to
  `sales+<inbound_email_key>@parse.misenmore.com`
- Edge function parses the `+key` from the envelope To address, calls
  `org_id_for_inbound_key(p_key)` helper to resolve the org, stamps the row
- Service role bypasses RLS; the helper centralizes lookup so a bad/unknown key
  can't silently land rows in a random org

**Alternatives considered and rejected:**

- Subdomain per org (`sales@<orgslug>.parse...`) — needs per-org MX or wildcard
  inbound stream, no benefit over plus-addressing
- From-address mapping table — brittle, ties org identity to specific staff
  email
- Gmail/Outlook OAuth per org — real multi-tenant pattern but big lift (OAuth
  flow, token refresh, polling); overkill for v1, premium onboarding path
  long-term
- Kill inbound email entirely (manual upload) — adds daily friction for the
  customer

**Current state (carried over from Phase 6):** `process-sales-data/index.ts` and
`process-banquets/index.ts` both stamp every row with `TEST_ORG_ID` (env var,
fallback uuid `cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e`). The dedupe delete in
`process-sales-data` also scopes by this uuid. Confirmed needs verification:
Phase 8 migration adding `inbound_email_key` is written but
unverified-as-applied; `process-banquets` and `process-sales-data` files are
modified in working tree but plus-addressing parse path unconfirmed.

**Phase 8 blocker rules:**

- Before the first real (non-test) org is provisioned, replace `TEST_ORG_ID`
  with the plus-addressing lookup. Do NOT deploy to a second org without fixing
  this.
- `process-beo` is NOT affected — it already accepts `org_id` in its payload
  (only invoked from authenticated dashboard, never from Postmark).
- If the test org uuid changes during teardown, both edge functions must be
  updated first or Postmark ingestion will 500.
- Search for `TODO(Phase 8)` in `supabase/functions/` to find current marker
  comments.
