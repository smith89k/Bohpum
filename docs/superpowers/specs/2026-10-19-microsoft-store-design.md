# Bohpum in the Microsoft Store (MSIX, signed by Microsoft) — design

Date: 2026-10-19 · Status: approved by the user in three parts ("Looks right" to each). Plan: docs/superpowers/plans/2026-10-19-microsoft-store.md.

The user's words: "let use Microsoft Store (MSIX) to get free code-signing" — after SignPath Foundation said no and
the repository went private again. Then, one question at a time: Store listing for **everyone**; **keep both** (the
installer handed out today and the Store version); the Publisher reader **inside** the Store version; each release
**made by the Release button and uploaded by hand** in Partner Center; approach 1, "one button, two files".

**Changed the same day, after 0.2.4 was released with both files:** "next release should not build .exe and push to
R2, since we use microsoft store." Since 0.2.5 the Release run makes only the Store package: no installer, nothing to
R2, no secret (the reader is built from the MSI on every release). Copies installed from an installer stay on 0.2.4;
the R2 bucket, its lock and keys stay so they keep their reader download. The app code for installer copies stays.

## Why
SmartScreen warns about Bohpum's installer because it has no signature, and a certificate costs money. Since
September 2025 a Microsoft Store developer account is free for individuals, and an MSIX package sent to the Store is
signed by Microsoft and updated by the Store. Store users get Bohpum with no warning. Nobody has to buy a certificate.

## Decided
- **Who gets it:** everyone. The Store listing is public and searchable.
- **Two ways to get Bohpum, one app:** the NSIS installer stays exactly as it is (unsigned, updates itself from
  bohpum-update.smith89k.com, Publisher reader downloaded once). The Store version is new. Both are built from the same
  code by the same Release run.
- **Store version, reader inside:** LibreOffice (the trimmed reader, about 165 MB) ships in the MSIX. No reader
  download, so nothing in the Store version downloads a program (Store policy 10.2.2 is unclear about that), and .pub
  files open offline on the first try. Store updates are differential, so an unchanged reader is not downloaded again.
- **Sending a version to the Store:** the Release run puts the .msix on the (private) GitHub release; the user
  downloads it and submits it in Partner Center by hand. Microsoft reviews it (usually 1–3 days).
- **First Store version:** the next release (0.2.4 unless another release comes first). Website users see no change,
  so this needs no What's new entry of its own.

## 1. How the Store version behaves
Electron sets `process.windowsStore` when the app runs from an MSIX package. One helper decides "this copy is the
Store version" from that, and everything below asks the helper (so tests can switch it on).

- **Updates:** off. electron-updater is never loaded (the Store updates the package; an MSIX app may not update
  itself). Help › Check for Updates opens Bohpum's Store page (`ms-windows-store://pdp/?ProductId=<Store ID>`), and
  the update-ready box never shows.
- **Publisher reader:** found inside the package (`resources/libreoffice/...soffice.exe`), so the reader rules
  (reader.js `chooseReader`) get a new first choice, "bundled", and never answer "download". The download box, the
  convert window's question and the no-key message stay for the installer version only.
- **No keys:** the Store package has no update-config.json. A Store package can be downloaded and opened by anyone,
  so the R2 key must never be in it. The release checks the .msix for the file and stops if it is there.
- **Right-click menu:** "Convert to Bohpum (.bpum)" on .pub files comes from the package manifest. It reuses
  explorer-menu/AppxManifest.xml's `windows.fileExplorerContextMenus` and `windows.comServer` (SurrogateServer, the
  same BohpumMenu.dll and CLSID), with the DLL's path inside the package. No sparse package, no HKCU keys, no
  "allow changes" prompt. `--explorer-menu=…`, the menu repair check and `cleanOld` do nothing in the Store version.
  menu.cpp finds Bohpum.exe two folders above the DLL, which is still true inside the package.
- **Files:** `.bpum` opens in Bohpum with its own icon (from package.json `fileAssociations`, which electron-builder
  also writes into the MSIX). `.pub` gets a file type association in the manifest, so Bohpum appears in "Open with".
  Windows never makes a packaged app the default by itself, so Publisher keeps .pub (as installer.nsh does today).
- **Unchanged:** the editor, printing, What's new, About. Settings live in the package's own data folder
  (Windows redirects AppData for packaged apps), so a PC with both versions has two separate apps.

## 2. How the Release run makes the Store file
- The build job builds the NSIS installer first, exactly as now. Then it runs electron-builder again with a Store
  config, target `appx`, which makes `Bohpum-Store-<version>.msix`:
  - `files` without update-config.json (the update-key step still writes it into the workspace for the installer;
    the Store config simply leaves it out).
  - `extraResources` adds the trimmed reader (`libreoffice/`). The build job gets it the same way it gets it for
    R2 today: made from The Document Foundation's MSI with scripts/reader-pack.js, or the pack already in R2.
  - `appx`: identityName, publisher and publisherDisplayName from Partner Center (they are not secrets and go in
    the repository), applicationId `Bohpum`, displayName `Bohpum`, `customExtensionsPath` pointing to a small XML
    file with the menu, COM server and .pub extensions, and the Windows 10 minimum the menu needs (10.0.19041.0).
  - Not signed: Partner Center signs it after certification.
- Version: electron-builder writes 0.2.5 as 0.2.5.0, as the Store requires.
- The .msix is attached to the GitHub release next to the installer. It never goes to R2: installed copies of the
  installer version must not see it, and R2 prune keeps working as now.
- The release notes on GitHub get one line: the Store file is for Partner Center.

## 3. One-time setup (the user, in Partner Center), and testing
**Setup**, click by click in docs/updates-setup.md (a new "Microsoft Store" section):
1. Open a free individual developer account at storedeveloper.microsoft.com (Microsoft account, ID photo, selfie).
2. Reserve the name "Bohpum".
3. Copy from Product identity: Package/Identity/Name, Package/Identity/Publisher,
   Package/Properties/PublisherDisplayName and the Store ID. They go into package.json and the Store-page link.
4. A privacy policy URL (Partner Center asks for one): Claude writes the text (Bohpum collects nothing; files stay
   on the PC); the user puts it on smith89k.com.
5. Store listing: description (Claude writes it), screenshots, age rating questionnaire; in the submission, the
   reason for the `runFullTrust` capability (a classic desktop app; Claude writes the sentence).

**Testing**
- Automatic (tests/*.test.js): the Store-version helper; with it on, no updater and Check for Updates answers with
  the Store page; the reader rules pick "bundled" first and never ask to download; the menu commands and repair check
  do nothing; the Store config has no update-config.json and has the reader; release-workflow.test.js checks the
  appx step, the "no keys in the .msix" check, and that the .msix goes to the GitHub release but not to R2.
- On this PC before the first submission (building needs the user's yes, as always): a test .msix with the
  `OID.2.25.311729368913984317654407730594956997722=1` publisher (the one the menu's sparse package uses), installed
  with `Add-AppxPackage -AllowUnsigned`; then open a .pub, use the right-click menu on a .pub, open a .bpum, and
  check Help › Check for Updates. Then run the Windows App Certification Kit on the real (Store identity) .msix.

**What could still go wrong**
- Certification may ask about runFullTrust or the LibreOffice inside. Answer in the submission notes and resubmit.
- The right-click menu runs in a COM surrogate inside the package: the list file it writes to %TEMP%\Bohpum must be
  where the app reads it. The PC test above checks exactly that.

## Not doing
- Sending to the Store automatically (needs Microsoft Entra ID setup; the user chose to upload by hand).
- A private or hidden Store listing.
- Signing the installer version (it stays unsigned; the Store is the warning-free way to get Bohpum).
- Moving installer users to the Store.
