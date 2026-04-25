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

**Current phase:** Phase 7 closed (RLS live on all 11 domain tables). Phase 7.5
is the next planned commit — anon kitchen JWT hardening (replaces raw-anon-key
access with signInAnonymously + signed JWT carrying org_id, rewrites every anon
RLS policy to scope on current_org_id() instead of `using (true)`). Phase 8
follows (admin panel + Postmark per-org routing + first real org provisioning).

**How to apply:** All work in this session is for MisenMore only. DailyBrief is
never touched here. Before assuming a phase number from this memory, confirm
against CHANGES.md — this field lags.
