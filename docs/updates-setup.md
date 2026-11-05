# Releases, automatic updates and the Publisher reader — setup

> **Since 0.2.5 a release makes only the Microsoft Store package** (section 6 and section 8): no installer, and
> nothing goes to R2. Sections 1–5 and 7 describe the private updates that copies installed from an installer (0.2.4
> and older) still use: keep the bucket, the lock and the keys as they are, or those copies can no longer download the
> Publisher reader. They stay on 0.2.4; to get newer versions, people install Bohpum from the Store.

Installed copies of Bohpum check **https://bohpum-update.smith89k.com/** when they start and every 6 hours. A new
version downloads quietly; the app then asks **Restart now** or **Later** (Later = it installs when Bohpum is closed).
**Help › Check for Updates** checks by hand.

The same address holds the **Publisher reader**: a trimmed LibreOffice that reads `.pub` files. It is not in the
installer; Bohpum downloads it once, the first time a Publisher file is opened, after asking.

The address is **private**, as Sastra PDF's: it is locked with Cloudflare Access, and only requests carrying Bohpum's
own service token get in; anyone else — a browser too — gets **403**. The release job builds the token into the app
(`update-config.json`, never committed), so every copy installed from a release installer updates itself and can
download the reader. There is no public download link: you give people the installer yourself (it is on the GitHub
release page, which only you can see — the repository is private).

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

Since 0.2.5 a release makes only the Microsoft Store package; there is no installer and nothing goes to R2.

1. `pnpm version 0.3.0 --no-git-tag-version --no-git-checks` (only edits package.json).
2. Write the version's What's new at the top of `src/notes.js` with today's date (it becomes the GitHub release notes)
   and as `### <version>` in `docs/store-listing.md` (the Store page's notes: "New in this version:", then one line per
   change, "- Name: what it does.") — the build refuses to run without both.
3. Commit and push main.
4. GitHub → **Actions** → **Release** → **Run workflow** → type `0.3.0` → Run
   (or `gh workflow run release.yml -R smith89k/Bohpum -f version=0.3.0`).
5. Download `Bohpum-Store-0.3.0.msix` from the GitHub release and submit it in Partner Center (section 8).

The run has three jobs, each on its own fresh machine, and uses no secret:
- **check** (the GitHub token, installs nothing): the version matches package.json and isn't released yet, and
  `store.json` holds the Store identity.
- **build** (no token): installs the tools; downloads LibreOffice's MSI from The Document Foundation, checks its
  SHA-256, unpacks and trims it (section 7) and checks the trimmed copy opens `samples/demo-card.pub`; builds the
  right-click menu; builds the Store package with the reader inside; and checks the package has the reader and the
  menu, and no update key (`scripts/store-check.js`).
- **publish** (the GitHub token, installs nothing): makes the GitHub release `v0.3.0` with the notes and the package.
It stops with a plain message if the version doesn't match package.json, is already released, or `store.json` is
missing.

## 7. The Publisher reader

`libreoffice.json` pins one LibreOffice: its version, a trim number (`pack`), the Windows x64 MSI's address in The
Document Foundation's archive (old versions stay there) and that file's SHA-256. The pack is named
`LibreOffice-<version>-pack<pack>`, and the bucket holds it under `reader/`:

| File | Purpose |
|---|---|
| `reader/<pack>.zip` | the trimmed LibreOffice that installed copies download once |
| `reader/<pack>.json` | `{ name, size, sha256 }` of the zip; uploaded after it, so a later release reuses the pack |

Since 0.2.5 every release downloads the MSI, checks its SHA-256, unpacks it (`msiexec /a`, nothing is installed),
trims it (`scripts/reader-pack.js`, the same trim as `scripts/bundle-libreoffice.js`), checks the trimmed copy opens
`samples/demo-card.pub` (`scripts/reader-check.js`), and puts it inside the Store package. Nothing is uploaded: the
packs already under `reader/` stay for copies installed from an installer (0.2.4 and older), which download them once.

**Never delete anything under `reader/`**: those copies still want their own pack.

**Moving to a newer LibreOffice** (for example a security fix): take the version from
https://download.documentfoundation.org/libreoffice/stable/, find its folder under
https://downloadarchive.documentfoundation.org/libreoffice/old/ (e.g. `26.8.1.1`), and put the version, the
`…/win/x86_64/LibreOffice_<x.y.z.w>_Win_x86-64.msi` address and that file's SHA-256 (`certutil -hashfile <msi> SHA256`;
it must match the "SHA-256 Hash" on the download page) into `libreoffice.json`. Bump `pack` only when the trim changes.
Release: the next Store version carries the newer LibreOffice.

In the Store version the reader is inside the package (`resources\libreoffice`). In an installer copy it lives in
`%LOCALAPPDATA%\Bohpum\reader\<pack>\`; updates don't touch it, and a full uninstall removes it.

## 8. The Microsoft Store

The Store version is the same Bohpum with the Publisher reader inside and no update key. Microsoft signs it, so
Windows shows no warning, and the Store keeps it up to date. Since 0.2.5 it is the only version released.

**Once:**
1. Open a free developer account at https://storedeveloper.microsoft.com with your Microsoft account. Microsoft checks
   a photo of your ID and a selfie; this can take a few days.
2. Partner Center → **Apps and games** → **New product** → **MSIX or PWA app** → reserve the name **Bohpum**.
3. Bohpum → **Product management** → **Product identity**. Copy four values into `store.json` at the top of the
   repository, then commit and push it (they are not secret):
   ```json
   {
     "identityName": "<Package/Identity/Name>",
     "publisher": "<Package/Identity/Publisher, CN=…>",
     "publisherDisplayName": "<Package/Properties/PublisherDisplayName>",
     "storeId": "<Store ID, 12 characters>"
   }
   ```
   Every release makes `Bohpum-Store-<version>.msix` from it and puts it on the GitHub release. (Done on 2026-10-19:
   `smith89k.Bohpum`, Store ID `9MWKGK7SCMJS`.)
4. Put the privacy policy from `docs/store-listing.md` on a page of your website (for example
   https://smith89k.com/bohpum/privacy) — Partner Center asks for its address.
5. The first submission: **Pricing and availability** (Free; markets: all), **Properties** (category Productivity;
   privacy policy address), **Age ratings** (the questionnaire: no violence, no user content shared, no purchases),
   **Store listings** (English: description, features and keywords from `docs/store-listing.md`, at least one
   screenshot of Bohpum with a publication open), **Submission options** → restricted capabilities: paste the
   `runFullTrust` sentence from `docs/store-listing.md`.

**Each release:**
1. Release as in section 6.
2. Open the GitHub release `v<version>` and download `Bohpum-Store-<version>.msix`.
3. Partner Center → Bohpum → **Start update** (or, the first time, the submission above) → **Packages** → drag the
   `.msix` in → wait until it says it is valid → **Submit to the Store**.
4. Microsoft checks it, usually in 1 to 3 days. Store users then get the update by themselves. If certification asks a
   question (most likely about `runFullTrust` or the LibreOffice inside), answer it in **Notes for certification** and
   submit again.

**The update panel on a real update** (Store copy only, as Sastra PDF's). A copy shows it only for updates that come
after the version that added it. The question to the Store can be tried on this PC at any time, from inside the
installed Store copy. In PowerShell, with the path of a built `BohpumStoreUpdate.exe` (`pnpm run build:menu`):
`Invoke-CommandInDesktopPackage -PackageFamilyName smith89k.Bohpum_d9wvxw143ha0g -AppId Bohpum -Command cmd.exe -Args '/c ""<path>\BohpumStoreUpdate.exe" check > "%TEMP%\store-check.txt""' -PreventBreakaway`,
then read that file: `count` 1 means the Store offers an update. Tried on 2026-11-05 with 0.3.0 installed and 0.3.1 in
the Store: `count` 1, `silent` true, but `version` "0.3.0.0", the installed one, so the panel says "New version" with no
number. Still to see on the first real update: the download bar, Install, and whether Windows opens Bohpum again by
itself. A Partner Center package flight can limit a test release to chosen accounts.

**Trying the Store package on this PC first** (before a first submission, or after changing the manifest):
`pnpm run bundle-libreoffice`, then in PowerShell
`$env:BOHPUM_STORE_SIDELOAD='1'; $env:BOHPUM_STORE_READER='vendor/libreoffice'; pnpm run dist:store`, then in an
administrator PowerShell `Add-AppxPackage -Path dist-store\Bohpum-Store-<version>.msix -AllowUnsigned`. It installs as
"Bohpum" (identity `Bohpum.StoreTest`); remove it with `Get-AppxPackage Bohpum.StoreTest | Remove-AppxPackage`.

## Good to know

- **Giving someone Bohpum:** send them its Store link, https://apps.microsoft.com/detail/9MWKGK7SCMJS (it works once
  Microsoft has published the first submission). The Store keeps their copy up to date.
- **Copies without the key** — 0.1.0 (built by hand), anything built locally (`pnpm run dist`), `pnpm start` — never
  update and can't download the reader: install a release's installer once. A LibreOffice installed on the PC still
  reads Publisher files in them.
- **Windows SmartScreen** warns about the installer because it isn't code-signed yet: **More info** → **Run anyway**.
  Updates installed by the app don't show this.
- **Without the warning:** the Microsoft Store version (section 8) is signed by Microsoft. Send people the Store link
  instead of the installer when they shouldn't see SmartScreen at all.
- **What the app sends:** only the requests for `latest.yml`, the installer and its blockmap, and — when you say
  Download — the reader pack, all with the update key. Nothing about the user or their files. Problems with a check or
  a download go to `%TEMP%\Bohpum\update.log` (a download you asked for also says what went wrong in its box).
- **The update key is inside every installer**, so anyone you give the file to could pull it out and download later
  versions too. That matches "only people I give the file to". If it leaks further: Zero Trust → Service credentials →
  refresh or replace `bohpum-updater`, update the two `CF_ACCESS_*` secrets and release a new version — copies
  holding the old key stop updating and must install the new version by hand.
- **A leaked upload key:** delete the R2 token, make a new one (section 2), update `R2_ACCESS_KEY_ID` and
  `R2_SECRET_ACCESS_KEY`. Installed copies don't hold it, so they keep updating.
- **Cost:** R2's free tier (10 GB stored, no charge for downloads) and Zero Trust's free plan cover this easily.
