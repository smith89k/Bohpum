# Update panel for the Microsoft Store copy — design

**Date:** 2026-11-05
**Status:** built (the user: "make update function like Sastra PDF")

## Why

Sastra PDF got a badge and update panel for its Store copy on 2026-11-05 (its design:
`E:\_httdocs\SastraPDF\docs\superpowers\specs\2026-11-05-store-update-panel-design.md`, which already said "Bohpum may
follow later using the same approach"). The user asked for the same in Bohpum. Until now Bohpum's Store copy had nothing:
Help › Check for Updates only opened Bohpum's page in the Store app.

Everything in Sastra PDF's design holds here: the goals, non-goals, anti-goals, the stages and their words, the timings,
the helper program, the reopening, the privacy wording. This page lists only what is different in Bohpum.

## Same parts, Bohpum's names

| Sastra PDF | Bohpum |
|---|---|
| `store-update/update.cpp` → `SastraStoreUpdate.exe` | the same source → `BohpumStoreUpdate.exe` |
| `store-update/restart.cpp` → `SastraRestart.node` | the same source → `BohpumRestart.node` |
| `store-update.js` | the same file (only the header differs) |
| `app/update-panel.js`, `window.SastraUpdatePanel` | `src/update-panel.js`, `window.BohpumUpdatePanel` |
| `SASTRA_STORE_HELPER` (tests) | `BOHPUM_STORE_HELPER` (tests) |
| `%TEMP%\Sastra PDF\update.log` | `%TEMP%\Bohpum\update.log` (the log updater.js already used) |

Both programs are built by `scripts/build-explorer-menu.js` (`pnpm run build:menu`, also run by `dist` and `dist:store`)
into `store-update/out/` (gitignored). Only the Store config (`scripts/store-config.js`) ships them, at
`resources/store-update/`; `scripts/store-check.js` refuses a Store package without them.

## What differs

- **Badge position.** Bohpum's logo row is the title row (`#titlebar`: logo, menus, the publication's name). The badge
  (`#b-update`, 112 px) sits at its right end, just before Windows' ─ □ ✕. `#doc-title` shrinks to give it room, so no
  narrowing steps were needed; at the smallest window (900 px) it still fits after Help. It stays in Maximize page area
  (Bohpum has no Present). While another box is open it is greyed and can't be clicked, as the menus are.
- **The panel is one of Bohpum's own boxes**: `.modal-back` in `#modal-root` with `.modal-h` / `.modal-b` / `.modal-f`,
  so `screenFree` and `whenFree` (one box at a time) count it, and the app's keys are off while it is open. A press
  outside closes it (as Bohpum's other boxes), never while installing. Primary buttons are on the right, as in Bohpum.
- **Words.** "Bohpum" in place of "Sastra PDF". The up-to-date answer keeps Bohpum's existing sentence: "Bohpum X is the
  newest version." The block on Install is the convert window (Explorer menu's Convert to Bohpum): "Bohpum can't
  install while files are being converted" / "Wait for the small convert window to finish, then click Install again."
- **Unsaved changes.** Bohpum's own question (`saveFirst` in `src/app.js`, shared with the installer copy's Restart now):
  "Your publication has unsaved changes. Save them before installing?" Save / Don't save / Cancel.
- **Closing guard.** main.js keeps `dirty` (not Sastra's `allowClose`): Install sets it false, and puts it back when the
  install didn't happen, so a later ✕ still asks.

## Found while building

The helper, run inside the real Store copy on this PC (0.3.0 installed, 0.3.1 in the Store), answered
`{"count":1,"version":"0.3.0.0","silent":true}`: the Store reports the **installed** version, not the new one. So the
panel shows "New version" with no number and says "Bohpum will close to install the update." This was planned for
(`nextVersion` gives null when the number isn't newer).

## How it is checked

- `tests/store-update.test.js`: the state rules with fake helper runs and fake timers.
- `tests/store-panel.test.js`, `tests/store-panel-check.test.js`: the badge and every stage with
  `tests/fake-store-helper.js` standing in for the helper (`tests/store-panel-kit.js` sets it up).
- `tests/store-wiring.test.js`: a Store copy whose helper can't run ends in "Couldn't check for updates", never stuck.
- `tests/store-check.test.js`, `tests/store-package.test.js`: the helpers are in the Store package only.
- `tests/update-boxes.test.js`: no badge and no Store update state in a copy that isn't the Store's.
- The real download, Install and reopening can only be seen on the first real update after a release that has this
  code (see `docs/updates-setup.md`, section 8).
