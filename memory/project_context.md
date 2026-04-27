---
name: MisenMore Project Context
description: What MisenMore is, origin story, repo/Supabase details, relationship to DailyBrief
type: project
---

MisenMore is a universal multi-tenant kitchen and restaurant management platform
— the commercial product successor to DailyBrief.

**Why it exists:** DailyBrief was built for Old Hawthorne Country Club
(single-org). Retrofitting multi-tenancy into the live app posed unacceptable
risk to Old Hawthorne's production data. A clean fork was chosen so
multi-tenancy could be built in from day one without migration complexity.

**Relationship to DailyBrief:**

- DailyBrief stays frozen as Old Hawthorne's standalone app — never touched by
  MisenMore work
- MisenMore uses DailyBrief's UI/component code as a starting template
- Completely separate: different repo, different Supabase project, different
  Vercel deployment

**GitHub:** https://github.com/SirCoffee1429/MisenMore **Local path:**
C:\MisenMore\Misenmore **Supabase project ref:** unqflkmrdfmxtggrcglc,
https://unqflkmrdfmxtggrcglc.supabase.co **Supabase org:** epbtryuelqfowetkyoot
— same org as DailyBrief. **Accessible via the Supabase MCP server.** Phase
2/3/7 migrations were applied via MCP (apply_migration). Dashboard is only
required for auth user creation, auth hook toggles, and enabling Anonymous
Sign-Ins (required for Phase 7.5).

**Tech stack:** React 19 + Vite, React Router v7, Supabase (Postgres + RLS +
Edge Functions), Vercel, Google Gemini 3 Flash, Postmark

**Current phase:** Phase 8 closed (admin panel + Postmark per-org routing
shipped 2026-04-26, commit `7bf7be3`). Phase 7.5 is the next commit — anon
kitchen JWT hardening, must land before first real customer org is provisioned.
Phase numbering is logical, not chronological: Phase 7.5 ships after Phase 8
because the security fix was scoped after the admin panel was already in flight.
CHANGES.md documents the ordering note in the Phase 7.5 entry when it lands.

**How to apply:** All work in this session is for MisenMore only. DailyBrief is
never touched here. Before assuming a phase number from this memory, confirm
against CHANGES.md — this field lags.
