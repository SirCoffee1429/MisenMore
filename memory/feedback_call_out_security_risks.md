---
name: Call out security risks even when accepted
description: User wants proactive security callouts on any vulnerability spotted, including risks already accepted in CHANGES.md, IMPLEMENTATION_PLAN.md, or prior phase design decisions
type: feedback
originSessionId: f5543e71-2ab5-451d-ad16-8c99a51d93c5
---
Always call out security vulnerabilities when I see them, even if they are already documented as accepted trade-offs in CHANGES.md, phase followups, or IMPLEMENTATION_PLAN.md.

**Why:** User is new to multi-tenant SaaS architecture and security. They may have accepted a risk in an earlier phase without fully understanding its implications. Silently going along with "this is known-good per CHANGES.md" deprives them of the critique they explicitly want. Data sensitivity does not matter — any cross-tenant write/read vector is a risk for a multi-org SaaS platform.

**How to apply:**
- When reviewing or touching code, if I notice a vulnerability (cross-tenant write paths, missing server-side validation, RLS policies with `using (true)`, app-side-only org scoping on writes, etc.), flag it explicitly even if it's part of an accepted phase design.
- Frame it as "here's the risk + here's what an attacker could do + here's a possible fix" — not just a vague warning.
- Do not treat prior acceptance in CHANGES.md as closing the matter. The user wants the chance to reconsider.
- Applies especially to MisenMore's multi-tenant boundaries: anon kitchen write paths, Postmark inbound routing, Storage bucket keys, edge function org_id stamping.
