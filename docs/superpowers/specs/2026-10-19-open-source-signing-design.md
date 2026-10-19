# Open source and free code signing (SignPath) — design

Date: 2026-10-19 · Status: approved by the user in chat ("can not install, microsoft smart screen block" → "go open
source" → GPL-3.0, remove the real card fully → "don't dublicate use only 1" → after finding the private-updates work
of 2026-10-18 on GitHub: open source **yes**, keep updates from the own server, **keep the same repository**)

## Why
SmartScreen blocks the installers because they have no signature. SignPath Foundation signs open-source projects for
free (certificate issued to SignPath Foundation, shown as the publisher). Its terms (signpath.org/terms): an OSI license
for all components; already released in the form to be signed; built from the public source on CI; a **Code signing
policy** on the home page ("Free code signing provided by SignPath.io, certificate by SignPath Foundation", team roles,
a privacy statement); MFA for every team member; every release approved by hand; product name and version in the signed
files; an uninstaller. Backup if SignPath says no: a Certum open-source certificate (small yearly fee, own name).

## Starting point
This PC's `main` was 26 commits behind GitHub: 0.2.0–0.2.2 added private updates (electron-updater, a Cloudflare R2
bucket behind `bohpum-update.smith89k.com` locked with Cloudflare Access, the update key built into release installers),
the Publisher reader downloaded on first use, and a three-job release workflow (check → build → publish, run by hand).
The first plan (tag-triggered workflow, npm, LibreOffice in the installer, version 0.1.1) was made on the old copy; it
is replaced by this one. The old local work is merged with GitHub's `main` (no history thrown away; backup branch
`backup/open-source-old-base` until the history clean-up).

## 1. License (GPL-3.0-or-later)
`LICENSE` (GPL 3.0 text), `package.json` license / repository / homepage, the About line "Free software under the GNU
GPL 3.0 or later, with no warranty. Source code on GitHub" (GPL 3.0 §5(d)); `tests/about.test.js` checks it.

## 2. Remove the real card
The `samples/card-*` files are a real greeting to a government official. `samples/demo-card.pub` (made in Microsoft
Publisher, made-up text) and `samples/demo-card.bpum` (made from it by the app's convert window) replace them in every
test and in the release job's reader check. Before the repository goes public, the card files are removed from every
commit of every branch and tag (`git filter-branch --index-filter … -- --all`, tags rewritten too), then the rewritten
`main` and tags `v0.2.0`–`v0.2.2` are force-pushed. A local `git bundle` of the old history stays on this PC only.

## 3. One repository
The same `smith89k/Bohpum` turns public (it keeps the six Cloudflare secrets and the 0.2.x release pages). GitHub may
keep unreachable old commits by id for a while; ask GitHub Support to purge cached views after the force-push
(no forks, no pull requests exist). **Confirm with the user before the force-push and before making it public.**

## 4. Signing in the release workflow
Two jobs between build and publish, only when the repository variable `SIGNPATH_ORGANIZATION_ID` is set:
- build also uploads the installer alone (`installer-unsigned`) and outputs its artifact id.
- **sign** (ubuntu, only `SIGNPATH_API_TOKEN`, nothing installed, `actions: read`):
  `signpath/github-action-submit-signing-request@v3` (project `Bohpum`, policy `release-signing`), waits up to 6 h for
  the approval, uploads `installer-signed`.
- **rehash** (no keys): `scripts/rehash-installer.js` puts the signed file into `dist/` and makes the `.blockmap` and
  `latest.yml`'s SHA-512 and size again with electron-builder's `buildBlockMap` (signing changes the bytes; installed
  copies verify both). It refuses a file with no Authenticode certificate table, or one latest.yml doesn't name.
  Uploads `installer-final`.
- **publish** needs all four and runs when check and build succeeded and either SignPath is not set up (sign skipped)
  or rehash succeeded — never an unsigned release once signing is on; a failed signing uploads nothing, so the version
  can be released again. It takes `installer-final` when there is one.
- Release notes: "Download the installer below…", and "Free and open source (GNU GPL 3.0). Code signing policy".
Only the installer is signed (what SmartScreen checks on download); `Bohpum.exe` inside stays unsigned for now.
`win.publisherName` is not set, so electron-updater does not check the publisher of updates.

## 5. Version 0.2.3
What's new: New — open source on GitHub, About links to it; Improved — ready for a free signature from SignPath.

## 6. README and docs/updates-setup.md
README: open source intro, **Download** (Releases page, SmartScreen steps until signed), **Build from source** (git
clone, pnpm), **Releasing** (+ approve in SignPath), **Code signing policy**, **Privacy** (SignPath's sentence with the
two exceptions: update checks and the reader download, both to `bohpum-update.smith89k.com`, nothing about the user or
files), **License** (GPL + third-party parts), project layout. updates-setup.md: the repository is public, the lock now
only keeps out requests not from an installed Bohpum, section 8 "Code signing (SignPath)" (MFA, apply, SignPath
project/policy/artifact configuration, the variable and secret, approving), the sign and rehash jobs.

## The user does
Turn on GitHub two-step login; say yes before the force-push / going public and before any release run; apply at
signpath.org/apply after the first public release; then set `SIGNPATH_ORGANIZATION_ID` and `SIGNPATH_API_TOKEN`;
approve each signing request.

## Testing
`pnpm test` (all files) passes. New: `tests/rehash-installer.test.js` (a crafted PE with and without a certificate
table, the blockmap equal to electron-builder's, latest.yml lines replaced); `tests/release-workflow.test.js` checks the
five jobs, who sees which secret, the SignPath condition and that publish never releases unsigned once signing is on.
History check: no `samples/card-*` in any commit, no Khmer text from the card in any commit message.
