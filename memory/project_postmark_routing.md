---
name: Postmark inbound multi-tenant routing
description: Plus-addressing via organizations.inbound_email_key is how
  Postmark inbound resolves to org_id; shipped Phase 8
type: project
---

**Live design (since Phase 8, 2026-04-26):**

- Single Postmark inbound stream → edge function URL
- Each org has `organizations.inbound_email_key` (32-char random,
  unique-indexed)
- Office configures email forwarding to
  `sales+<inbound_email_key>@parse.misenmore.com`
- Edge functions (`process-sales-data`, `process-banquets`) extract the key from
  Postmark's `MailboxHash` first, fall back to regex on the `To` header
- `org_id_for_inbound_key(p_key)` resolves the org; bad/missing keys return 400
  (missing) or 404 (unknown). No silent landing in a default org.
- Service role bypasses RLS in the edge function; the helper centralizes org
  lookup so the routing path is auditable.

**Why this approach:** [keep the alternatives-rejected list as-is — still
useful]

**Affected files (post Phase 8):**

- `supabase/functions/process-sales-data/index.ts` — plus-addressing routing
- `supabase/functions/process-banquets/index.ts` — plus-addressing routing
- `supabase/functions/process-beo/index.ts` — NOT affected (accepts org_id in
  payload, only invoked from authenticated dashboard)

**Operational notes:**

- New org provisioning: admin panel's `create_org` generates the
  `inbound_email_key` automatically. Office staff sees it on the org's admin
  row. Forwarding rule must be configured in their email provider before the
  first inbound email arrives.
- Key rotation: admin panel `rotate_inbound_key` action regenerates the key. Old
  forwarding rule must be updated by office staff or inbound emails 404.
