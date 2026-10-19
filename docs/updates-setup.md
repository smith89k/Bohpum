# Releases, automatic updates and the Publisher reader — setup

Installed copies of Bohpum check **https://bohpum-update.smith89k.com/** when they start and every 6 hours. A new
version downloads quietly; the app then asks **Restart now** or **Later** (Later = it installs when Bohpum is closed).
**Help › Check for Updates** checks by hand.

The same address holds the **Publisher reader**: a trimmed LibreOffice that reads `.pub` files. It is not in the
installer; Bohpum downloads it once, the first time a Publisher file is opened, after asking.

The address is **locked**, as Sastra PDF's: Cloudflare Access lets in only requests carrying Bohpum's own service
token; anyone else — a browser too — gets **403**. The release job builds the token into the app
(`update-config.json`, never committed), so every copy installed from a release installer updates itself and can
download the reader. Since 2026-10-19 Bohpum is open source (GNU GPL 3.0) and the repository is public: anyone can
download the installer from the GitHub release page, so the lock now keeps out only requests that don't come from an
installed Bohpum. The source code never holds the key; only the release job's installers do.

The files live in a Cloudflare R2 bucket. GitHub Actions builds each release and puts it there; only the release job
can upload or delete.

> **Never change the address** after the first release: every installed copy has it built in (package.json
> `build.publish.url`), and copies would stop updating.

**Set up on 2026-10-18**:
- R2 bucket `bohpum-updates` (Asia-Pacific, Standard, r2.dev off), custom domain `bohpum-update.smith89k.com`
  (CNAME added by Cloudflare).
- R2 Account API token `bohpum-release` (Object Read & Write, `bohpum-updates` only, no expiry) — the upload key.
- Zero Trust service token `bohpum-updater` (non-expiring) — the update key inside the app.
- Zero Trust Access application `bohpum-update` (self-hosted, `bohpum-update.smith89k.com`) with one policy
  **Bohpum app only**: action **Service Auth**, include **Service Token = bohpum-updater**.
- The six GitHub secrets on smith89k/Bohpum. Checked: `curl -I https://bohpum-update.smith89k.com/latest.yml` → 403,
  and the same for `reader/…`. That the update key opens it is checked by every release before anything is built.

**0.2.0 released on 2026-10-18** (the first release made this way): the run built the Publisher reader pack
`LibreOffice-26.8.1-pack1` (165 MB) from The Document Foundation's MSI, uploaded it and the installer, and found the
address locked (403 without the key) and open with it. The installer from the GitHub release, installed on the
developer's PC, downloaded the reader from R2 on the first `.pub` (about 11 s) and opened the file; its update check
read `latest.yml` through the lock.

**0.2.1 released on 2026-10-18** (the right panel tidied): the run reused the reader pack, removed the 0.2.0 installer
from the bucket (its blockmap stays) and found the lock in place. The installed 0.2.0 updated itself on the real
address: it found 0.2.1 about 10 s after starting, downloaded only the changed parts (1.6 MB of 110 MB, using the
blockmaps), showed "Bohpum 0.2.1 is ready to install", and Restart now installed it and started 0.2.1, the reader kept.

Nothing here is shared with Sastra PDF or AI Hub: Bohpum has its own bucket, tokens and Access application.

## 1. The bucket (Cloudflare R2) — once

1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket** → name `bohpum-updates` (it only goes into a GitHub
   secret). Location: **Asia-Pacific**. Storage class: Standard.
2. Open the bucket → **Settings** → **Custom Domains** → **Add** → `bohpum-update.smith89k.com` → Continue → Connect
   domain. (smith89k.com is on Cloudflare, so the DNS record is made for you.)
3. Same page: leave **Public Development URL (r2.dev)** **disabled**.

## 2. The upload key (R2) — once

1. **R2 Object Storage** → **API Tokens** (`…/r2/api-tokens`) → **Create Account API token**.
2. Name `bohpum-release`, permission **Object Read & Write**, **Apply to specific buckets only** → `bohpum-updates`.
   TTL: Forever. → Create.
3. Copy the **Access Key ID** and the **Secret Access Key** straight into GitHub (section 4) — the secret is shown once.

## 3. The lock (Cloudflare Access) — once

1. **Zero Trust** → **Access controls** → **Service credentials** → **Create Service Token** → name `bohpum-updater`,
   duration **Non-expiring** (the default, 1 year, would stop every installed copy from updating a year later) →
   Generate token. Put the **Client Secret** into GitHub first (section 4, `CF_ACCESS_CLIENT_SECRET`): it is shown
   only once, and the box can close when you switch tabs. The **Client ID** (it ends in `.access`) stays visible on the
   token's page afterwards. (On 2026-10-18 the secret went from the copy button straight into GitHub with
   `gh secret set CF_ACCESS_CLIENT_SECRET -R smith89k/Bohpum --body (Get-Clipboard -Raw).Trim()` in PowerShell, so the
   tab never had to change.)
2. **Access controls** → **Applications** → **Create new application** → **Self-hosted and private** → Continue.
   Name `bohpum-update`. Destination: subdomain `bohpum-update`, domain `smith89k.com` (the whole domain, no path).
   **Create new policy**: name `Bohpum app only`, action **Service Auth**, Include → **Service Token** →
   `bohpum-updater` → Save policy. → Create.

## 4. GitHub secrets — once

GitHub → **smith89k/Bohpum** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name | Value |
|---|---|
| `R2_ACCOUNT_ID` | the Cloudflare Account ID (in the dashboard's address bar) |
| `R2_BUCKET` | `bohpum-updates` |
| `R2_ACCESS_KEY_ID` | the upload token's Access Key ID |
| `R2_SECRET_ACCESS_KEY` | the upload token's Secret Access Key |
| `CF_ACCESS_CLIENT_ID` | the service token's Client ID |
| `CF_ACCESS_CLIENT_SECRET` | the service token's Client Secret |

Paste each value from Cloudflare straight into GitHub: never into a file, a chat or a note.
`gh secret list -R smith89k/Bohpum` should then list the six names.

## 5. Check it

    curl -I https://bohpum-update.smith89k.com/latest.yml

**403** = locked (right). **200** would mean anyone can download: check the Access application. Every release also
checks this by itself, for `latest.yml` and for the reader pack, and that the update key opens both (step "The update
address is locked, and opens with the key").

## 6. Releasing a version

1. `pnpm version 0.3.0 --no-git-tag-version --no-git-checks` (only edits package.json).
2. Write the version's entry at the top of `src/notes.js` (What's new) with today's date — the build refuses to run
   without it, and it becomes the GitHub release notes.
3. Commit and push main.
4. GitHub → **Actions** → **Release** → **Run workflow** → type `0.3.0` → Run
   (or `gh workflow run release.yml -R smith89k/Bohpum -f version=0.3.0`).

The run has three jobs, each on its own fresh machine, so the upload key never shares a machine with other people's
code:
- **check** (has the keys, installs nothing): the version and the six secrets, nothing left in the bucket by a stopped
  run, and whether the Publisher reader pack is already there. Only a real "not found" counts as absent; any other
  answer from R2 stops the run instead of guessing (a guess could overwrite a pack installed copies already trust).
- **build** (no upload key, no GitHub token): installs the tools, builds the reader pack if the bucket hasn't got it
  (section 7), puts the update key and the pack's name, size and SHA-256 into the app, builds the installer (with the
  right-click menu).
- **publish** (has the keys, installs nothing; only the built files and this repository's own scripts): uploads the
  pack if it is new, then the installer (installer first, `latest.yml` last); checks the address is locked and opens
  with the key; removes the older installers there (their small `.blockmap` files and every reader pack stay); and
  makes the GitHub release `v0.3.0` with the notes and the installer to hand out.
Once SignPath is set up (section 8) there are two more jobs between build and publish:
- **sign** (only the SignPath token, installs nothing): sends the installer to SignPath and waits — up to 6 hours —
  until you approve the signing request there. SignPath gives back the signed installer.
- **rehash** (no keys): the signature changes the installer's bytes, so the blockmap and `latest.yml`'s SHA-512 and
  size are made again from the signed file (`scripts/rehash-installer.js`, with electron-builder's own blockmap code);
  installed copies check both before they install an update.
publish then uploads and releases the signed files. If signing is refused, fails or isn't approved in time, publish
doesn't run: nothing is uploaded and nothing is released, and the same version can be released again.

It stops with a plain message if the version doesn't match package.json, is already released, or a secret is missing.
If a run stops half-way after uploading (the installer is in the bucket but there's no GitHub release), the next run of
the same version refuses: bump the version and release again.

After the first update that reaches an installed copy, right-click a `.pub` in File Explorer and check that
**Convert to Bohpum** is still in the first menu (or that Bohpum offered to set it up again and it worked).

## 7. The Publisher reader

`libreoffice.json` pins one LibreOffice: its version, a trim number (`pack`), the Windows x64 MSI's address in The
Document Foundation's archive (old versions stay there) and that file's SHA-256. The pack is named
`LibreOffice-<version>-pack<pack>`, and the bucket holds it under `reader/`:

| File | Purpose |
|---|---|
| `reader/<pack>.zip` | the trimmed LibreOffice that installed copies download once |
| `reader/<pack>.json` | `{ name, size, sha256 }` of the zip; uploaded after it, so a later release reuses the pack |

When `reader/<pack>.json` isn't there yet, the release job downloads the MSI, checks its SHA-256, unpacks it
(`msiexec /a`, nothing is installed), trims it (`scripts/reader-pack.js`, the same trim as
`scripts/bundle-libreoffice.js`), checks the trimmed copy opens `samples/demo-card.pub`
(`scripts/reader-check.js`), and uploads the zip, then the json. Otherwise it reuses the json that is there.

**The job never deletes anything under `reader/`**: a copy that hasn't updated yet still wants its own pack. There is
one pack per LibreOffice change, so this stays small.

**Moving to a newer LibreOffice** (for example a security fix): take the version from
https://download.documentfoundation.org/libreoffice/stable/, find its folder under
https://downloadarchive.documentfoundation.org/libreoffice/old/ (e.g. `26.8.1.1`), and put the version, the
`…/win/x86_64/LibreOffice_<x.y.z.w>_Win_x86-64.msi` address and that file's SHA-256 (`certutil -hashfile <msi> SHA256`;
it must match the "SHA-256 Hash" on the download page) into `libreoffice.json`. Bump `pack` only when the trim changes.
Release. Installed copies then say "A newer Publisher reader is ready" the next time a Publisher file is opened.

In the app the reader lives in `%LOCALAPPDATA%\Bohpum\reader\<pack>\`. Updates don't touch it; a full uninstall
removes it.

## 8. Code signing (SignPath Foundation) — once

Windows SmartScreen blocks new installers that carry no signature. SignPath Foundation signs open-source projects for
free; the certificate is issued to SignPath Foundation, so Windows shows **SignPath Foundation** as the publisher.
Their conditions (https://signpath.org/terms): an OSI license, the project already released, built on GitHub from the
public code, the **Code signing policy** and **Privacy** sections in the README (done), every release approved by hand,
and **two-step login (MFA) on GitHub and on SignPath** for everyone in the project.

1. GitHub → Settings → Password and authentication → turn on **two-factor authentication** (if it is off).
2. Release one version the normal way (section 6): SignPath wants a project that is already released.
3. Apply at **https://signpath.org/apply** with the repository `https://github.com/smith89k/Bohpum`. They may ask about
   the Visual C++ runtime files inside the Publisher reader pack: Microsoft's redistributable files, which LibreOffice
   ships too.
4. When they accept, in SignPath: the project is **`Bohpum`**, linked to the repository, with GitHub.com as its trusted
   build system; the signing policy **`release-signing`** (approval by you); the artifact configuration signs the one
   `.exe` in the artifact (`<zip-file><pe-file path="*.exe" /></zip-file>`). Make an API token for a CI user that may
   submit to that policy.
5. GitHub → **smith89k/Bohpum** → **Settings** → **Secrets and variables** → **Actions**:
   - **Variables** tab → `SIGNPATH_ORGANIZATION_ID` = your SignPath organization ID
   - **Secrets** tab → `SIGNPATH_API_TOKEN` = the API token (paste it straight from SignPath)
6. Release the next version. The run stops at **sign** until you approve the request in SignPath (you get an email);
   then the release has the signed installer. Check: right-click it → Properties → **Digital Signatures** shows
   SignPath Foundation.

Without the variable the job skips sign and rehash and releases unsigned, as before. To stop signing, delete the
variable.

## Good to know

- **Giving someone Bohpum:** send them the link to the GitHub releases page
  (https://github.com/smith89k/Bohpum/releases), or download the installer there and send them the file. Their copy
  updates itself from then on.
- **Copies without the key** — 0.1.0 (built by hand), anything built locally (`pnpm run dist`), `pnpm start` — never
  update and can't download the reader: install a release's installer once. A LibreOffice installed on the PC still
  reads Publisher files in them.
- **Windows SmartScreen** warns about the installer until it is code-signed (section 8): **More info** → **Run anyway**.
  Updates installed by the app don't show this.
- **What the app sends:** only the requests for `latest.yml`, the installer and its blockmap, and — when you say
  Download — the reader pack, all with the update key. Nothing about the user or their files. Problems with a check or
  a download go to `%TEMP%\Bohpum\update.log` (a download you asked for also says what went wrong in its box).
- **The update key is inside every installer**, and the installers are public, so anyone could pull it out and
  download updates and the reader without installing Bohpum. Downloads from R2 cost nothing, so this is harmless. If it
  is ever abused: Zero Trust → Service credentials → refresh or replace `bohpum-updater`, update the two `CF_ACCESS_*`
  secrets and release a new version — copies holding the old key stop updating and must install the new version by hand.
- **A leaked upload key:** delete the R2 token, make a new one (section 2), update `R2_ACCESS_KEY_ID` and
  `R2_SECRET_ACCESS_KEY`. Installed copies don't hold it, so they keep updating.
- **Cost:** R2's free tier (10 GB stored, no charge for downloads) and Zero Trust's free plan cover this easily.
