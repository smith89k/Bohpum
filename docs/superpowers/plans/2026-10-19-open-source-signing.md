# Open source and SignPath signing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bohpum public and GPL-3.0 in its one repository, with the release workflow ready for SignPath Foundation's free
signing, so SmartScreen stops blocking the installer.

**Architecture:** see `docs/superpowers/specs/2026-10-19-open-source-signing-design.md` (revised after merging GitHub's
newer `main`). The first version of this plan (tag-triggered npm workflow, 0.1.1) was dropped with that revision.

## Global Constraints
- License `GPL-3.0-or-later`; one repository `smith89k/Bohpum`; version **0.2.3** dated 2026-10-19.
- Never run a release or build an installer without the user's yes. Confirm before force-pushing and before going public.
- Commit on `main`; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. pnpm, not npm.

### Task 1: Merge GitHub's main into the local work
- [x] `git merge --no-commit origin/main`; resolve: release.yml, release-notes.js, whats-new test = GitHub's;
  package.json = GitHub's + license/repository/homepage; About test = both checks; package-lock.json removed;
  README rewritten; my release-notes test removed (GitHub's release-scripts test covers its script).
- [x] Every `card-original` use → `demo-card` (5 tests, the release job's reader check, updates-setup.md);
  `samples/demo-card.bpum` made with the app's convert window.

### Task 2: Signing in the release workflow (TDD)
- [x] `tests/release-workflow.test.js`: five jobs, needs, the SignPath condition, secrets per job, publish's `if`,
  the signed artifact, the code signing policy link. `tests/rehash-installer.test.js`: crafted PE files.
- [x] `scripts/rehash-installer.js`; release.yml: build's `installer-unsigned` + output, jobs sign and rehash, publish.
- [ ] `pnpm test tests/release-workflow.test.js tests/rehash-installer.test.js tests/release-scripts.test.js` PASS.

### Task 3: 0.2.3, README, setup guide
- [x] package.json 0.2.3, src/notes.js entry; README; docs/updates-setup.md section 8 and the public repository.
- [ ] `pnpm test` (all files) PASS.

### Task 4: History clean-up and going public (user's yes first)
- [ ] `git bundle create ../Bohpum-old-history.bundle --all`; delete `backup/open-source-old-base`.
- [ ] `git filter-branch --prune-empty --index-filter 'git rm --cached --ignore-unmatch -q -- "samples/card-*"' --tag-name-filter cat -- --all`;
  drop `refs/original`, expire the reflog, `git gc --prune=now`.
- [ ] Check: `git log --all -- "samples/card-*"` empty; no card text in commit messages; tests still pass.
- [ ] Force-push `main` and the tags; check the 0.2.x releases still point at their tags; make the repository public.
