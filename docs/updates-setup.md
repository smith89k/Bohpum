# Releases, automatic updates and the Publisher reader — setup

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

> **Not set up yet.** Sections 1–4 are done once; then this note becomes a "Set up on <date>" list of the names
> (never the secrets).

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
   Generate token. Copy the **Client ID** and **Client Secret** straight into GitHub (section 4); the secret is shown
   once, and Cloudflare closes that box when you switch tabs — copy both first.
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

The job checks the version and the six secrets; reuses the Publisher reader pack if it is already in the bucket, or
builds it (section 7); puts the update key and the pack's name, size and SHA-256 into the app; builds the installer
(with the right-click menu); uploads it to the bucket (installer first, `latest.yml` last); checks the address is
locked and opens with the key; removes the older installers there (their small `.blockmap` files and every reader pack
stay); and makes the GitHub release `v0.3.0` with the notes and the installer to hand out.
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
`scripts/bundle-libreoffice.js`), checks the trimmed copy opens `samples/card-original.pub`
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

## Good to know

- **Giving someone Bohpum:** download the installer from the GitHub release page and send them the file. Their copy
  updates itself from then on.
- **Copies without the key** — 0.1.0 (built by hand), anything built locally (`pnpm run dist`), `pnpm start` — never
  update and can't download the reader: install a release's installer once. A LibreOffice installed on the PC still
  reads Publisher files in them.
- **Windows SmartScreen** warns about the installer because it isn't code-signed yet: **More info** → **Run anyway**.
  Updates installed by the app don't show this.
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
