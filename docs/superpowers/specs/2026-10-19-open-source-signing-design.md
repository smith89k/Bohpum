# Open source, cloud build and free code signing (SignPath) — design

Date: 2026-10-19 · Status: approved by the user in chat ("can not install, microsoft smart screen block" → "go open
source" → GPL-3.0, remove the real card fully → the plan below → "ok, don't forget read me")

## Why
SmartScreen blocks `Bohpum Setup 0.1.0.exe`: it has no signature (`Get-AuthenticodeSignature` → NotSigned). SignPath
Foundation signs open-source projects for free (certificate issued to SignPath Foundation, so Windows shows that
name as the publisher). Its terms (signpath.org/terms): an OSI license for all components; **already released in the
form to be signed**; binaries **built from the public source on CI** in a verifiable way; a **Code signing policy** on the
home page with the sentence "Free code signing provided by SignPath.io, certificate by SignPath Foundation", the team
roles and a privacy statement; MFA for every team member on GitHub and SignPath; every release approved by hand;
product name and version set in the signed files; an uninstaller. Backup if SignPath says no: a Certum open-source
certificate (small yearly fee, the user's own name).

## 1. License (GPL-3.0-or-later)
- `LICENSE`: the GPL 3.0 text, unchanged (gnu.org/licenses/gpl-3.0.txt).
- `package.json`: `"license": "GPL-3.0-or-later"`, `"repository"` / `"homepage"` → github.com/smith89k/Bohpum.
- About window, under the one-line description: "Free software under the GNU GPL 3.0 or later, with no warranty.
  Source code on GitHub" (the link opens github.com/smith89k/Bohpum in the browser, as the other About links).
  GPL 3.0 §5(d) asks interactive programs to show this. `tests/about.test.js` checks the line and the link.

## 2. Remove the real card
- `samples/card-original.pub`, `card-original.bpum`, `card-on-A4.pdf`, `card-libreoffice.pdf`, `card-kbach-export.pdf`
  are a real greeting to a government official. They go away from every commit.
- New `samples/demo-card.pub`, made in Microsoft Publisher (installed on this PC) through its COM interface: a small
  card with a made-up English + Khmer greeting, a border and a picture-free layout, no real names.
  `tests/convert-task.test.js` copies it instead of `card-original.pub` (same checks).
- History: `git filter-branch --index-filter 'git rm --cached --ignore-unmatch -q -- "samples/card-*"' -- --all`, then
  drop `refs/original`, expire the reflog and `git gc --prune=now`. Check: `git log --all -- "samples/card-*"` is empty and
  no commit message holds the card's text. Old plan/spec docs keep the old file name (only a name, no content).

## 3. Publish
- **One repo only** (the user: "don't duplicate use only 1"). GitHub keeps unreachable commits of a repo, so flipping the
  private repo to public after a force-push could leave the card findable by commit id. Instead: before the history
  rewrite, `git bundle create` the old history to one backup file on this PC (outside the repo, never uploaded); delete
  the private `smith89k/Bohpum` (`gh repo delete`, needs the `delete_repo` scope); create a new public `smith89k/Bohpum`
  with the same name and push the clean history; `origin` keeps the same URL. The About link github.com/smith89k still
  works.
- **Stop and confirm with the user before deleting the private repo and creating the public one** (point of no return).

## 4. Cloud build (`.github/workflows/release.yml`)
- Runs on a pushed tag `v*` and by hand (`workflow_dispatch`, which builds only and uploads the installer as a run
  artifact, no release). `windows-latest` (has Visual Studio C++ tools and the Windows SDK for `build:menu`).
- Steps: checkout → Node LTS → `choco install libreoffice-fresh` (into Program Files, where
  `bundle-libreoffice.js` looks) → `npm ci` → the tag must equal `v` + package.json's version, else stop →
  `npm run dist` → upload `dist/Bohpum Setup <version>.exe` as an artifact.
- Signing job, only when the repo variable `SIGNPATH_ORGANIZATION_ID` is set: `signpath/github-action-submit-signing-request`
  (secret `SIGNPATH_API_TOKEN`, project `Bohpum`, policy `release-signing`), waits for the user's approval in SignPath,
  downloads the signed installer. Without the variable the release ships the unsigned installer.
- Release job (tags only): `gh release create <tag> "<installer>" --title "Bohpum <version>" --notes-file <notes>`, the
  notes made by `scripts/release-notes.js` from `src/notes.js` (same `vm` loading as `check-notes.js`; tested by
  `tests/release-notes.test.js`).
- Only the installer is signed (that is the file SmartScreen checks on download). Signing `Bohpum.exe` inside it too
  needs two signing requests per release; left for later.
- The first public release is **0.1.1** (a 0.1.0 installer already exists on PCs). Its What's new: New — "Bohpum is
  open source (GPL 3.0); the code is on GitHub"; Improved — "The installer is built on GitHub so it can be signed".
- Building an installer (here or by pushing a tag) only after the user says yes.

## 5. README
- Top: what Bohpum is, **Download** (the Releases page), what to do while the download is unsigned (More info → Run
  anyway; or Properties → Unblock).
- **Build from source**: `git clone` instead of the `E:\` path; Node LTS, LibreOffice, VS Build Tools + Windows SDK.
- **Making a release**: version + notes → commit → tag `vX.Y.Z` → push the tag → the workflow builds it → approve in
  SignPath → the release appears.
- **Code signing policy**: the SignPath sentence; Committers and reviewers: Sunnguon TAING; Approvers: Sunnguon TAING;
  only the release workflow's builds of tagged versions are signed; until SignPath accepts the project, releases are
  unsigned.
- **Privacy**: "This program will not transfer any information to other networked systems unless specifically requested
  by the user" (Bohpum makes no network calls; About links open in the browser).
- **License**: GPL-3.0-or-later, copyright © 2026 Sunnguon TAING; third-party parts (Electron MIT, LibreOffice MPL-2.0,
  IBM Plex and Noto Sans Khmer OFL 1.1, as in About).
- Project layout gains `LICENSE`, `.github/workflows/release.yml`, `scripts/release-notes.js`, `samples/`.

## The user does
Turn on GitHub two-step login if it is off; say yes to the first build / tag; apply at signpath.org/apply after the
first public release; when accepted, give the SignPath organization id and API token (set as repo variable + secret);
approve each signing request.

## Testing
`npm test` passes (convert test on the demo card, About line, release notes). History check as in §2. The workflow is
checked by one `workflow_dispatch` run after publishing (with the user's yes).
