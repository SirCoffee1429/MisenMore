---
name: MisenMore phase-by-phase commit discipline
description: Each phase of the MisenMore build is a single commit with a full CHANGES.md entry plus a refreshed prompt.md handoff
type: project
---

MisenMore is built in sequential numbered phases. Each phase is a scoped unit of
work, ends with a single git commit, and produces two artifacts:

1. **A new entry at the top of `.claude/changes_made/CHANGES.md`** — dated,
   typed (feat/fix/etc.), with sections: Summary, Details (grouped by
   new/updated/deleted files), Verification, Followups, Next. Multi-paragraph;
   this is the authoritative log.
2. **A refreshed `prompt.md` in the repo root** — session-handoff doc. Starts
   with "Starting a new session on MisenMore at…", restates the init protocol,
   then covers: where we are, what was built, gotchas carried over, test
   scaffolding, environment, open decisions, next-phase scope, pre-touch
   checklist. Rewritten (not appended) at the end of each session.

**Phase numbering:** Half-phases (e.g. Phase 7.5) are valid when a security or
architectural fix needs to land before the next planned major phase. Phase 7.5
(anon JWT hardening) precedes Phase 8 (admin panel + Postmark routing + first
real org) because multi-tenant anon must be locked down before provisioning org
#2.

**Why:** Ryan ends sessions with"ending this session." CHANGES.md is permanent
history; prompt.md is the handoff.

**How to apply:**

- Never interleave two phases in one commit.
- Phase 7.5 verification requires reseeding `test-org-b` with deterministic uuid
  `11111111-1111-1111-1111-111111111111`, running cross-tenant attack tests
  (foreign org_id in `.eq()`, tampered JWT, revoked token), then tearing down
  before commit.
- Commit message format `<type>: <description>` per
  `~/.claude/rules/common/git-workflow.md`. Body drawn from CHANGES.md entry.
- If a session ends mid-phase without commit, next session's first action is
  `git status`, review diff, commit before proceeding.
- Do not rewrite prompt.md until all phase work is done and verified.
