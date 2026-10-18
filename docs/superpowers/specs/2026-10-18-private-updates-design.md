# Private releases, automatic updates and the Publisher reader download — design

Date: 2026-10-18 · Status: approved by the user ("yes"). Plan: docs/superpowers/plans/2026-10-18-private-updates.md.

The user's words: "build in github action and push to R2 cloudflare for private update. similar to sastra pdf." —
then "can libreoffice ship to update folder in R2 for plug-in? keep instalation file smaller and user download only 1
time" — agreed the download starts the first time someone opens a Publisher file, with a box and a progress bar — asked
"can download libreoffice from their site?" and agreed to: "the build gets it from their site, trims it, and stores it
in your private storage, so users download a small pack one time" — then "ok" to the whole picture, including the
address, the first version number and who does the Cloudflare clicks (see "Decided").

## Why
Today Bohpum is built by hand on a PC that has LibreOffice installed, and the installer carries a trimmed LibreOffice
inside it, which makes it big. Nobody gets new versions unless they are handed a new installer. The user wants what
Sastra PDF has since 2026-10-17: one Release button in GitHub, private updates from Cloudflare R2, and copies that keep
themselves up to date. On top of that, LibreOffice comes out of the installer and becomes a one-time download (the
"Publisher reader"), so the installer and every update stay small.

## Prior art: Sastra PDF (C:\_httdocs\SastraPDF) — copy it, renamed
Read these first; most of this feature is the same thing with Bohpum's names:
- `.github/workflows/release.yml` — the release job (by hand only, checks, upload order, lock check, prune, GitHub release).
- `updater.js` — update rules with no Electron inside (`updatesRunHere`, `checkAnswer`, `installBlock`,
  `parseUpdateConfig`/`readUpdateConfig`, `logTo`, `createUpdater`), and how main.js wires it (search `updates.`).
- `scripts/r2-prune.js`, `scripts/release-notes.js` (Bohpum already has its own `scripts/check-notes.js`).
- `docs/updates-setup.md` — the Cloudflare + GitHub setup click by click, and how to release.
- `app/index.html` — the ready box (`updateReady`, `readyBox`, `inTurn`/`whenFree`), `restartForUpdate`,
  `checkUpdatesCmd`, and the right-click menu repair after an update (`explorer-menu.js` `repairNeeded`).
- `docs/superpowers/specs/2026-10-17-auto-update-design.md` — the reasons behind those choices.

What is different in Bohpum: the Publisher reader download (new), the page's boxes (`modal`, `choiceBox`, `readingBox`
in src/app.js, not Sastra's `askChoice`), the close question (`askClose`: Save / Don't save / Cancel, one publication,
`S.dirty`), the Help menu in main.js `buildMenu`, and LibreOffice leaving the installer.

## Goals
1. **Release with one action:** GitHub → Actions → Release → Run workflow → type the version. GitHub builds the
   installer (with the Explorer right-click menu), uploads it to a private R2 bucket for Bohpum, and makes a GitHub
   release with the What's new notes and the installer to hand out.
2. **Private:** only copies installed from a release installer can download updates or the reader. Anyone else,
   including a browser, gets refused.
3. **Installed copies update themselves**, as in Sastra PDF: quiet check and download, then the app's own box asks
   **Restart now** / **Later** (Later = installs when Bohpum is closed). **Help › Check for Updates…** checks by hand.
4. **Small installer:** no LibreOffice inside. The reader is downloaded once, the first time it's needed, and kept
   across updates.
5. **The right-click menu survives updates**, as in Sastra PDF (the repair box).

## Non-goals
- No public download link. The user hands out the installer from the GitHub release page (private repo).
- No beta channel, no portable build, no Mac/Linux, no code signing yet.
- No updates for `pnpm start`, local `pnpm run dist` builds, or the 0.1.0 copies built by hand: they install 0.2.0 once.
- No silent background download of the reader. It is only downloaded when the user says yes.
- Tests do not run in the release job (some test files fail on some PCs because of screen scale; see the memory note).

## Anti-goals (a failure even if it technically works)
- **Losing work:** Restart now must never close a publication with unsaved changes without asking.
- **A Windows message box**, or a box popping up over another box, the print screen or a file being read.
- **Downloading the reader without asking**, or using a reader whose download is broken or swapped (checksum).
- **A half-finished reader folder** (download stopped, disk full, PC turned off) being used later.
- **A release breaking installed copies:** removing what they still need (the newest installer, `latest.yml`, any
  `.blockmap`, any reader pack), or `latest.yml` pointing at an installer that isn't uploaded yet.
- **Sending anything about the user or their files.** Only the update files and the reader pack are requested.
- **Nagging:** a box answered once does not come back every start.

## Decided
By the user:
- Build and release on **GitHub Actions**, upload to **Cloudflare R2**, **private** like Sastra PDF (Cloudflare Access
  service token built into the app).
- **LibreOffice is a separate one-time download from the same private storage**, not inside the installer.
- **When:** the first time someone opens a Publisher file (or another outside format), or uses right-click
  "Convert to Bohpum". A box asks first, then shows a progress bar.
- **Where it comes from:** the release build downloads LibreOffice from The Document Foundation's site, trims it, packs
  it and uploads the pack to R2. Users download only that pack, never from their site.

Claude's calls, said to the user and accepted with "ok":
- Address **`https://bohpum-update.smith89k.com/`**, with its own bucket, upload token, service token and Access
  application. Nothing shared with Sastra PDF or AI Hub. **It must never change after the first release.**
- The first release made this way is **0.2.0**.
- Claude writes `docs/updates-setup.md` for Bohpum and can do the Cloudflare clicks with the user in their Chrome.
- If the PC already has LibreOffice installed normally, Bohpum uses it and doesn't ask to download.

## How it works

### Cloudflare and GitHub (once; steps go in docs/updates-setup.md, as in Sastra PDF)
- R2 bucket `bohpum-updates` (Asia-Pacific, Standard, r2.dev **off**), custom domain `bohpum-update.smith89k.com`.
- R2 Account API token `bohpum-release`: Object Read & Write, that bucket only, no expiry (the upload key).
- Zero Trust service token `bohpum-updater`, **non-expiring** (the key inside the app).
- Zero Trust Access application `bohpum-update` (self-hosted, `bohpum-update.smith89k.com`, whole domain) with one
  policy **Bohpum app only**: action Service Auth, include Service Token = `bohpum-updater`.
- Six repository secrets on **smith89k/Bohpum**, the same names as Sastra PDF: `R2_ACCOUNT_ID`, `R2_BUCKET`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`.

### What is in the bucket
| File | Kept | Purpose |
|---|---|---|
| `Bohpum-Setup-<version>.exe` | newest only | the installer updates download |
| `Bohpum-Setup-<version>.exe.blockmap` | all | lets an update download only the changed parts |
| `latest.yml` | always; `Cache-Control: no-cache` | tells installed copies the newest version |
| `reader/<pack>.zip` (e.g. `reader/LibreOffice-<lo version>-pack<rev>.zip`) | all, never removed by the job | the Publisher reader |

Reader packs are never deleted by the workflow: an installed copy that hasn't updated yet still wants its own pack.
There is one pack per LibreOffice change, so this stays small (R2's free 10 GB covers years).

### The reader pack (built by the release job)
- **Contents:** what `scripts/bundle-libreoffice.js` keeps today (the same SKIP list, one icon theme, the Visual C++
  runtime DLLs copied in), zipped. Its licence files stay inside.
- **Which LibreOffice:** one exact version, pinned in **one file in the repo** with its download address and SHA-256.
  The builder picks the current stable release when building this. Moving to a newer LibreOffice = change that file and
  release. The pack's name holds the LibreOffice version and a trim number, so changing either makes a new pack.
- **When the job builds it:** only if that pack isn't in R2 yet. Then: download the Windows x64 MSI from The Document
  Foundation (an archive address that stays valid for old versions), check its SHA-256, unpack it, trim it, and
  **check that the trimmed copy really opens a Publisher file** (headless convert of a file from `samples/`, like
  main.js `convertOne`) before uploading. Otherwise it reuses the pack already in R2.
- **What the app is told:** the pack's name, size and SHA-256 are **built into the app** at build time (like
  `update-config.json`), never read from the server, so nothing on the server can swap the pack. How the job learns
  the checksum of a pack built in an earlier run is the builder's call (a small file next to it in R2, or object
  metadata).
- **The installer no longer contains LibreOffice:** remove the `vendor/libreoffice` extraResources entry, and the
  bundle step from `pnpm run dist`. Keep a way for the developer to get a local LibreOffice for `pnpm start`
  (today's script, or an installed LibreOffice).

### Inside the app: the Publisher reader
- **Where it lives:** `%LOCALAPPDATA%\Bohpum\reader\<pack>\` (local, not roaming: it is large). Updates don't touch it.
  A full uninstall removes the `reader` folder; an update doesn't (installer.nsh `customUnInstall`, the non-update branch).
- **Which LibreOffice is used**, in this order: (1) the downloaded pack the app expects; (2) in `pnpm start` only, the
  developer's `vendor/libreoffice`; (3) a LibreOffice installed on the PC (today's list in `findSoffice`); (4) an
  older downloaded pack (see "A newer reader"). None of them → ask to download.
- **The question** (editor, before the reading box, in the app's own box): title "Bohpum needs the Publisher reader",
  text "It's a one-time download of about N MB. Bohpum's own files open without it." — **Not now** / **Download**
  (N from the size built into the app). Not now = the file doesn't open, nothing else happens.
- **Download** → the same box look as `readingBox`: "Downloading the Publisher reader…", a real progress bar with
  "12 of 160 MB", **Cancel** (also Esc). Then "Setting up the Publisher reader…", then it goes straight on to reading the
  file in the same box, without asking again.
- **Safety:** the download goes to a temporary file; size and SHA-256 must match before anything is unpacked; it is
  unpacked into a temporary folder next to the final one and renamed into place only when complete. A folder that
  isn't complete is never used, and is cleaned up next time. The download sends the same Cloudflare Access key headers
  as the updater. Unpacking must not add a big dependency (Windows' own `tar.exe` reads zip; builder's call).
- **Problems** (offline, refused, checksum wrong, disk full, cancelled) → the box says so in plain words, with Close.
  Nothing half-done is kept; the next Publisher file asks again. Problems are also written to the log.
- **One download at a time, owned by main.js:** if the editor and the convert window both need the reader, the second
  one waits for the same download instead of starting another.
- **The convert window** (Explorer menu, src/task.js) asks the same question inside its own window, as it already asks
  its "already there" question there, and shows the same progress. Whether Not now there skips the whole batch is the
  builder's call (it should not ask once per file).
- **A copy without the key** (`pnpm start`, local builds) can't download: "This copy can't download the Publisher
  reader. Install LibreOffice on this PC, or install Bohpum from a release installer."
- **A newer reader** (a later Bohpum expects a newer pack): the next Publisher file asks "A newer Publisher reader is
  ready" — **Not now** opens the file with the older pack, **Download** gets the new one. Once the new pack is in place,
  older pack folders are removed (not while a file is being read).

### Inside the app: updates (as in Sastra PDF)
- `electron-updater` (6.8.9, as Sastra PDF) becomes a runtime dependency. package.json `build.publish` =
  `{ provider: 'generic', url: 'https://bohpum-update.smith89k.com/' }`. nsis `artifactName`
  `Bohpum-Setup-${version}.${ext}` (no spaces, so `latest.yml` matches).
- The release job writes the service token into `update-config.json` (`{ clientId, clientSecret }`, in `.gitignore`,
  packed through `build.files`). No key → no update checks and no reader download.
- Runs only when packaged, on Windows. First check 10 s after start, then every 6 hours; quiet download; problems only
  in `%TEMP%\Bohpum\update.log`.
- **Ready box:** "Bohpum X is ready to install." — "Restart now to use it, or it installs the next time you close
  Bohpum." — **Later** / **Restart now**. Waits while any other box is open (`#modal-root` not empty), the print screen
  is up, or a file is being read; once per version per run.
- **Restart now:** if `S.dirty`, first the close question worded for a restart (Save / Don't save / Cancel; Cancel =
  nothing happens). Only then main installs (`quitAndInstall(true, true)`, after clearing `dirty` so the window's
  close guard doesn't stop it). Refused, with a plain message, while the convert window is working or the reader is
  downloading. If the installer didn't start: "The update couldn't be started." and it downloads again.
- **Help › Check for Updates…** above What's New: "Checking for updates…", then latest / downloading / couldn't check /
  "This copy doesn't update itself. Copies installed from a Bohpum release do." / the ready box.
- **Right-click menu repair** after a silent update: Bohpum's `explorer-menu.js` gets Sastra PDF's `repairNeeded` rule
  and the page its box ("The right-click menu needs to be set up again." Not now / Set up), after What's new and before
  the ready box.

### The release workflow (.github/workflows/release.yml)
Sastra PDF's job with Bohpum's names, plus the reader:
1. Checkout, pnpm (from `packageManager`), Node 24, `pnpm install --frozen-lockfile`.
2. Stop with a plain error if the typed version ≠ package.json, `v<version>` is already released, a secret is missing,
   or the installer is already in R2 from a stopped run.
3. `node scripts/check-notes.js`.
4. **The reader pack:** reuse it if it's in R2, otherwise build, test and upload it (above). Write its name, size and
   checksum into the app.
5. Write `update-config.json`. Build the Explorer menu, then `electron-builder --win nsis --publish never`.
6. Check the build made the installer, its blockmap and a `latest.yml` naming it. Keep the installer as a run artifact
   for 5 days.
7. Upload: installer, blockmap, then `latest.yml` LAST (no-cache), each checked by size.
8. Check the lock: `latest.yml` **and the reader pack** must be refused without the key and open with it.
9. Remove older `Bohpum-Setup-*.exe` from R2 (never a blockmap, never `latest.yml`, never anything under `reader/`).
10. GitHub release `v<version>`: notes from src/notes.js, the installer, its SHA-256, and a line saying the reader
    downloads once on first use.

Secrets reach only the steps that need them, as in Sastra PDF.

### Text changes
- **README:** the LibreOffice section (no longer inside the installer; how the pack is made and how to move to a newer
  LibreOffice for a security fix), how to release, and a privacy line: Bohpum goes online by itself only to check for
  updates, and downloads the Publisher reader only when you say yes; nothing about you or your files is sent.
- **About credits:** an electron-updater row and its helper libraries (as Sastra PDF's note), and the LibreOffice note
  changed to "downloaded once, the first time a Publisher file is opened; its licence files are in its folder".
- **What's new 0.2.0** (src/notes.js, plain words): Bohpum updates itself; the installer is smaller and the Publisher
  reader downloads once; Help › Check for Updates.
- **docs/updates-setup.md** for Bohpum, as Sastra PDF's, plus the reader pack.

## Testing (the builder plans the details)
- Unit tests for the pure rules: updater (as Sastra PDF), which LibreOffice to use, the pack check (size, checksum,
  incomplete folder ignored), the prune list (never `reader/`).
- The boxes (reader question and progress, ready box, Restart now with unsaved changes, Check for Updates, menu
  repair) tested in Electron with main's events faked, in the style of `tests/*.test.js`.
- **Seen working for real before it's called done**, against a local web server that refuses requests without the key:
  an installed older build updates itself to a newer one; a fresh install opens a `.pub` → asks → downloads → opens; the
  next `.pub` doesn't ask; offline → plain message, nothing left behind; a wrong checksum is refused; the convert window
  downloads the reader too.
- The first real release run on GitHub, then `curl -I https://bohpum-update.smith89k.com/latest.yml` → 403.

## Left to the builder
How the code is split into modules, IPC names, where the pinned LibreOffice version lives and its exact format, how
the pack's checksum reaches the app, how the MSI is unpacked on the runner, the unzip method, exact box wording beyond
what's above, the log format, and whether Not now in the convert window skips the whole batch.

## Later (not now)
- Code signing, then electron-updater can check the publisher of downloaded updates.
- A smaller pack format (7z) if the zip is still large.
