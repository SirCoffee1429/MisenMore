---
name: MisenMore phase-by-phase commit discipline
description: Each phase of the MisenMore build is a single commit with a full CHANGES.md entry plus a refreshed prompt.md handoff
type: project
---

MisenMore is built in sequential numbered phases. Each phase is a scoped unit of work, ends with a single git commit, and produces two artifacts:

1. **A new entry at the top of `.claude/changes_made/CHANGES.md`** — dated, typed (feat/fix/etc.), with sections: Summary, Details (grouped by new/updated/deleted files), Verification, Followups, Next. Multi-paragraph; this is the authoritative log.
2. **A refreshed `prompt.md` in the repo root** — session-handoff doc. Starts with "Starting a new session on MisenMore at…", restates the init protocol, then covers: where we are, what was built, gotchas carried over, test scaffolding, environment, open decisions, next-phase scope, pre-touch checklist. Rewritten (not appended) at the end of each session so the next cold start can pick up without reading history.

**Why:** Ryan explicitly ends sessions with the prompt: "write a prompt/summary of everything completed in this session into prompt.md. I will be ending this session. The idea for the prompt.md file is a prompt that I can feed into a new session and it bring it completely up to speed on where the project is at and where we ended and whats next." CHANGES.md is permanent history; prompt.md is the handoff. Both matter.

**How to apply:**
- Never interleave two phases in one commit. If mid-phase you notice a followup, log it in the phase's "Followups" section and address in the next phase.
- The commit message `<type>: <description>` follows the global git-workflow rule from `~/.claude/rules/common/git-workflow.md`. Body should be drawn from the CHANGES.md entry.
- Phase 7 must commit Phase 6 first (Phase 6 closed the prior session uncommitted).
- If a session ends mid-phase without commit, the next session's first action is: `git status`, review diff, commit before proceeding.
- Do not rewrite prompt.md until all phase work is done and verified — it's the final artifact.
