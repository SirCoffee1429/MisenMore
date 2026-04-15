---
name: MisenMore Project Context
description: What MisenMore is, origin story, repo/Supabase details, relationship to DailyBrief
type: project
---

MisenMore is a universal multi-tenant kitchen and restaurant management platform — the commercial product successor to DailyBrief.

**Why it exists:** DailyBrief was built for Old Hawthorne Country Club (single-org). Retrofitting multi-tenancy into the live app posed unacceptable risk to Old Hawthorne's production data. A clean fork was chosen so multi-tenancy could be built in from day one without migration complexity.

**Relationship to DailyBrief:**
- DailyBrief stays frozen as Old Hawthorne's standalone app — never touched by MisenMore work
- MisenMore uses DailyBrief's UI/component code as a starting template
- Completely separate: different repo, different Supabase project, different Vercel deployment

**GitHub:** https://github.com/SirCoffee1429/MisenMore
**Local path:** C:\MisenMore\Misenmore
**Supabase project ref:** unqflkmrdfmxtggrcglc, https://unqflkmrdfmxtggrcglc.supabase.co
**Supabase account:** DIFFERENT account from DailyBrief — MCP cannot access it. All SQL migrations must be run manually in the Supabase dashboard SQL editor.

**Tech stack:** React 19 + Vite, React Router v7, Supabase (Postgres + RLS + Edge Functions), Vercel, Google Gemini 3 Flash, Postmark

**Current phase:** Phase 1 — Project Foundation (as of 2026-04-14)

**How to apply:** All work in this session is for MisenMore only. DailyBrief is never touched here.
