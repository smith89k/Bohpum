# Open source, cloud build and SignPath signing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Bohpum as GPL-3.0 open source in one clean public GitHub repo, with a GitHub Actions build that SignPath
Foundation can sign, so SmartScreen stops blocking the installer.

**Architecture:** License + About line + README; the real card replaced by a made-up Publisher card and wiped from history;
`.github/workflows/release.yml` builds on `windows-2025` from a `v*` tag, optionally sends the installer to SignPath, and
publishes a GitHub release whose notes come from `src/notes.js` (`scripts/release-notes.js`).

**Tech Stack:** Electron 44, electron-builder (NSIS), GitHub Actions, SignPath `github-action-submit-signing-request@v3`,
Microsoft Publisher COM (one-off, for the demo card), git filter-branch.

Spec: `docs/superpowers/specs/2026-10-19-open-source-signing-design.md`.

## Global Constraints
- License `GPL-3.0-or-later`, copyright © 2026 Sunnguon TAING. Repo `https://github.com/smith89k/Bohpum`, **one repo only**.
- First public version **0.1.1**; its notes dated `2026-10-19`.
- Never build an installer (`npm run dist`, a pushed tag, a workflow run) without the user's yes.
- Stop and confirm before deleting the private repo / creating the public one.
- Commit straight to `main`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `npm test -- tests/<file>` for one file, `npm test` for all (each file runs the real app).

---

### Task 1: GPL-3.0 license and the About line

**Files:** Create `LICENSE` · Modify `package.json`, `src/app.js` (`openAbout`), `src/app.css` · Test `tests/about.test.js`

- [ ] **Step 1: failing test** — in `tests/about.test.js`, add `license` to the object read from the About page and a check
  before the "Footer" check:
  ```js
  // in the returned object:
  license: (q('.license') || {}).textContent || '', licenseLinks: [...m.querySelectorAll('.license a')].map(a => a.href),
  // new check:
  check('Free software under the GPL 3.0 or later, no warranty, with the license and the source code', about
    && /Free software under the GNU GPL 3\.0 or later, with no warranty/.test(about.license)
    && about.licenseLinks.join(' ') === 'https://www.gnu.org/licenses/gpl-3.0.html https://github.com/smith89k/Bohpum', about);
  ```
- [ ] **Step 2:** `npm test -- tests/about.test.js` → the new check FAILs.
- [ ] **Step 3: implement** — in `openAbout`, after the "(bohpum) is Khmer for “to print”" paragraph:
  ```js
      <p class="note license">Free software under the <a href="https://www.gnu.org/licenses/gpl-3.0.html" ${out}>GNU GPL 3.0</a> or later, with no warranty. <a href="https://github.com/smith89k/Bohpum" ${out}>Source code on GitHub</a></p>
  ```
  `src/app.css`: `.about .license a { color: var(--accent); }`.
  `LICENSE`: `curl -sL https://www.gnu.org/licenses/gpl-3.0.txt -o LICENSE` (unchanged text).
  `package.json`: `"license": "GPL-3.0-or-later"`, add `"repository": { "type": "git", "url": "https://github.com/smith89k/Bohpum.git" }`,
  `"homepage": "https://github.com/smith89k/Bohpum"`.
- [ ] **Step 4:** `npm test -- tests/about.test.js` → all PASS.
- [ ] **Step 5:** commit `feat: Bohpum is open source under the GPL 3.0 or later; About says so and links to the code`.

### Task 2: A made-up card replaces the real one

**Files:** Create `samples/demo-card.pub` · Delete `samples/card-*` (5 files) · Modify `tests/convert-task.test.js:21`

- [ ] **Step 1:** in `tests/convert-task.test.js` change `'card-original.pub'` → `'demo-card.pub'`; run
  `npm test -- tests/convert-task.test.js` → FAIL (file missing).
- [ ] **Step 2: make the card** — a one-off PowerShell script in the scratchpad (not in the repo), run with `pwsh`:
  ```powershell
  $out = 'E:\_httdocs\Bohpum\samples\demo-card.pub'
  $pub = New-Object -ComObject Publisher.Application
  try {
    $doc = $pub.NewDocument()
    $doc.PageSetup.PageWidth = $pub.MillimetersToPoints(110); $doc.PageSetup.PageHeight = $pub.MillimetersToPoints(60)
    $page = $doc.Pages.Item(1); $w = $doc.PageSetup.PageWidth; $h = $doc.PageSetup.PageHeight
    $frame = $page.Shapes.AddShape(1, 8, 8, $w - 16, $h - 16); $frame.Fill.Visible = 0; $frame.Line.Weight = 1
    $tb = $page.Shapes.AddTextbox(1, 16, 16, $w - 32, $h - 32)
    $tb.TextFrame.TextRange.Text = "កាតគំរូ បោះពុម្ព`rBohpum sample card`rMade-up text for tests. No real names."
    $tb.TextFrame.TextRange.ParagraphFormat.Alignment = 2   # centre
    $tb.TextFrame.TextRange.Font.Size = 11
    $doc.SaveAs($out); $doc.Close()
  } finally { $pub.Quit() }
  ```
- [ ] **Step 3:** `git rm -q samples/card-*`; `npm test -- tests/convert-task.test.js` → all PASS (card.pub → card.bpum).
- [ ] **Step 4:** commit `test: a made-up demo card replaces the real card in the samples`.

### Task 3: Release notes from src/notes.js

**Files:** Create `scripts/release-notes.js`, `tests/release-notes.test.js`

- [ ] **Step 1: failing test** `tests/release-notes.test.js`:
  ```js
  // scripts/release-notes.js writes a GitHub release's notes from src/notes.js (the What's new window's notes, tags in its
  // order), and stops with a plain message for a version with none, so release.yml never publishes empty notes.
  const { spawnSync } = require('child_process');
  const path = require('path');
  const { run, ROOT } = require('./harness');

  const script = path.join(ROOT, 'scripts', 'release-notes.js');
  const version = require(path.join(ROOT, 'package.json')).version;
  const notes = (...args) => {
    const r = spawnSync(process.execPath, [script, ...args], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' });
    return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
  };
  const WORDS = ['New', 'Improved', 'Fixed', 'Removed'];

  run(async (t, check) => {
    const e = await t.js(`window.BohpumNotes.noteFor(${JSON.stringify(version)})`);
    const r = notes(), lines = r.out.trim().split('\n');
    check("Heading: What's new in Bohpum <version> (<date>)", r.code === 0 && lines[0] === `What's new in Bohpum ${version} (${e.date})`, r);
    const items = lines.filter(l => l.startsWith('- '));
    check('One line per note, each tagged', items.length === e.notes.length && e.notes.every(n => r.out.includes(n.text))
      && items.every(l => /^- \*\*(New|Improved|Fixed|Removed):\*\* /.test(l)), r);
    const order = items.map(l => WORDS.indexOf(/\*\*(\w+):/.exec(l)[1]));
    check('Tags in the order New, Improved, Fixed, Removed', order.every((k, i) => !i || order[i - 1] <= k), order);
    const none = notes('9.9.9');
    check('A version with no notes stops with a plain message', none.code === 1 && /no notes for 9\.9\.9/.test(none.err), none);
  });
  ```
- [ ] **Step 2:** `npm test -- tests/release-notes.test.js` → FAIL (no script).
- [ ] **Step 3: implement** `scripts/release-notes.js`:
  ```js
  // Prints a version's GitHub release notes (package.json's by default) from src/notes.js — the same notes as the app's
  // What's new window, tags in its order. `node scripts/release-notes.js [version]`, run by .github/workflows/release.yml.
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const ROOT = path.join(__dirname, '..');
  const version = process.argv[2] || require(path.join(ROOT, 'package.json')).version;
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src', 'notes.js'), 'utf8'), { window });
  const N = window.BohpumNotes, e = N.noteFor(version);
  if (!e) { console.error(`release-notes: src/notes.js has no notes for ${version}`); process.exit(1); }
  const WORDS = { new: 'New', improved: 'Improved', fixed: 'Fixed', removed: 'Removed' };
  const sorted = e.notes.map((n, i) => [n, i]).sort((a, b) => N.KINDS.indexOf(a[0].kind) - N.KINDS.indexOf(b[0].kind) || a[1] - b[1]);
  console.log(`What's new in Bohpum ${version} (${e.date})\n\n` + sorted.map(([n]) => `- **${WORDS[n.kind]}:** ${n.text}`).join('\n'));
  ```
- [ ] **Step 4:** test → all PASS. **Step 5:** commit `feat: scripts/release-notes.js — a release's notes from src/notes.js`.

### Task 4: Version 0.1.1 and its What's new

**Files:** Modify `package.json`, `package-lock.json`, `src/notes.js`

- [ ] **Step 1:** `npm version 0.1.1 --no-git-tag-version`; `node scripts/check-notes.js` → FAILs ("newest entry is 0.1.0").
- [ ] **Step 2:** at the top of `NOTES` in `src/notes.js`:
  ```js
    N('0.1.1', '2026-10-19', [
      ['new', 'Bohpum is open source, under the GNU GPL 3.0. Anyone can read its code on GitHub; Help › About links to it.'],
      ['improved', 'The installer is now built on GitHub from the public code, ready for a free digital signature so Windows can trust it.']
    ]),
  ```
- [ ] **Step 3:** `node scripts/check-notes.js` → "newest 0.1.1 = package.json"; `npm test -- tests/check-notes.test.js tests/whats-new.test.js tests/release-notes.test.js` → PASS.
- [ ] **Step 4:** commit `chore: version 0.1.1, the first public release, with its What's new`.

### Task 5: Cloud build workflow

**Files:** Create `.github/workflows/release.yml` · Modify `package.json` (`dist`: `electron-builder --win nsis --publish never`,
so electron-builder never tries to publish on CI by itself)

- [ ] **Step 1:** write the workflow (build on `windows-2025`: checkout@v7, setup-node@v7 `lts/*` + npm cache, tag =
  `v`+version check, `choco install libreoffice-fresh -y --no-progress`, `npm ci`, `npm run dist`, upload-artifact@v7
  `installer` with `id: upload`; `sign` job on tags when `vars.SIGNPATH_ORGANIZATION_ID != ''`:
  `signpath/github-action-submit-signing-request@v3` with `api-token: secrets.SIGNPATH_API_TOKEN`, `organization-id`,
  `project-slug: Bohpum`, `signing-policy-slug: release-signing`, `github-artifact-id: needs.build.outputs.artifact-id`,
  `wait-for-completion-timeout-in-seconds: 21000`, `output-artifact-directory: signed`, then upload `installer-signed`;
  `release` job on tags when build succeeded and sign succeeded or was skipped: download the signed or unsigned
  artifact, `node scripts/release-notes.js <version> > notes.md`, `gh release create`).
- [ ] **Step 2:** check the YAML parses: `node -e "require('js-yaml')"` is not a dependency, so use
  `python -c "import sys,yaml; yaml.safe_load(open(sys.argv[1]))" .github/workflows/release.yml` (or `npx --yes yaml-lint`).
- [ ] **Step 3:** commit `ci: release workflow — build on GitHub from a v* tag, SignPath signing when set up, GitHub release`.

### Task 6: README

**Files:** Modify `README.md`

Sections: intro + **Download** (Releases page; the unsigned-warning steps: More info → Run anyway, or Properties → Unblock);
**Build from source** (git clone; Node LTS, LibreOffice, VS Build Tools C++ x64 + Windows SDK; `npm install`,
`npm run bundle-libreoffice`, `npm start`, `npm test`, `npm run dist`); **Making a release** (version + notes → commit →
`git tag vX.Y.Z` → `git push origin vX.Y.Z` → workflow → approve in SignPath → release; SignPath setup: repo variable
`SIGNPATH_ORGANIZATION_ID`, secret `SIGNPATH_API_TOKEN`, project `Bohpum`, policy `release-signing`, artifact
configuration = the zip with the `.exe` inside); **Code signing policy** (SignPath sentence, roles, what is signed, until
accepted releases are unsigned); **Privacy**; **License** (GPL-3.0-or-later + third-party). Project layout gains `LICENSE`,
`.github/workflows/release.yml`, `scripts/release-notes.js`, `samples/`. Keep every existing section (What it does,
Shortcuts, Known limits, Project layout).

- [ ] **Step 1:** edit; **Step 2:** commit `docs: README — download, build from source, releases, code signing policy, privacy, license`.

### Task 7: Full test run, then wipe the card from history

- [ ] **Step 1:** `npm test` → "All N test files passed".
- [ ] **Step 2:** backup: `git bundle create /e/_httdocs/Bohpum-old-history.bundle --all` (outside the repo, never uploaded).
- [ ] **Step 3:** `git filter-branch --prune-empty --index-filter 'git rm --cached --ignore-unmatch -q -- "samples/card-*"' -- --all`
  (`FILTER_BRANCH_SQUELCH_WARNING=1`).
- [ ] **Step 4:** `git for-each-ref --format='%(refname)' refs/original/ | xargs -r -n1 git update-ref -d`;
  `git reflog expire --expire=now --all && git gc --prune=now`.
- [ ] **Step 5: verify** — all empty: `git log --all --oneline -- "samples/card-*"`;
  `git rev-list --all --objects | grep "samples/card-"`; `git log --all --format=%B | grep -P "[\x{1780}-\x{17FF}]"`.
  `git status` clean; `npm test -- tests/convert-task.test.js tests/about.test.js` PASS.

### Task 8 (user's yes first): one public repo
- [ ] Show the user what goes public (file list, commit count). On yes: `gh repo delete smith89k/Bohpum --yes` (needs the
  `delete_repo` scope: if missing, the user runs `gh auth refresh -h github.com -s delete_repo` or deletes it in GitHub's
  Settings → Danger Zone); `gh repo create smith89k/Bohpum --public --description "..."`; `git push -u origin main`.
- [ ] Check: `gh repo view smith89k/Bohpum --json visibility` → PUBLIC; the card is not on GitHub.

### Task 9 (user's yes first): first release
- [ ] `git tag v0.1.1 && git push origin v0.1.1`; watch `gh run watch`; the release appears with the (unsigned) installer.
- [ ] Hand over: the user applies at signpath.org/apply; later sets the variable + secret.
