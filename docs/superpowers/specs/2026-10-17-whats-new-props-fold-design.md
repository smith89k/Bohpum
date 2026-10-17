# What's new window and folding right panel, as in Sastra PDF — design

Date: 2026-10-17 · Status: approved by the user in chat ("make what new page and right sidebar with fold-open sections
like sastra pdf" → What's new opens **on top of the welcome screen**; the plan below → "yes")
Model: Sastra PDF `app/notes.js`, `openNotes` / `notesAtStart` in `app/index.html`, `scripts/check-notes.js`
(docs/superpowers/specs/2026-10-17-whats-new-design.md there) and its Tools panel fold (2026-10-17-tools-fold-design.md).

## 1. What's new
### Behaviour
- The first start of a version this profile has not shown (an update or a new install): **What's new in 0.1.0** opens by
  itself, **on top of the welcome screen** (or over a file opened from Explorer). Closing it in any way (Close, Esc, Enter, a
  click outside) records the version; the welcome screen is still there underneath. It does not come back until the next
  version. Rule as in Sastra PDF: `shouldShow = noteFor(version) && seen !== version` (inequality, not "newer").
- **Help › What's New** (above About) opens the same window. It does nothing while another box is open (the menus are
  greyed out then anyway). Opening it this way also records the version.
- Each line starts with a tag: **New** (`--accent` on `--accent-soft`), **Improved** (`--ink` on `--chrome-2`), **Fixed**
  (`--sel` blue on a 14 % tint of it), **Removed** (`--ink-3` on `--chrome-2`). Lines are listed in that order of kinds, in
  written order within a kind.
- **See earlier versions ›** under the list reveals the older versions in the same window, each under "0.0.9 · 2026-…".
  Hidden when there are none (today: only 0.1.0).
- The window is the app's own `modal` (as About), 900 px wide, never taller than the window: title + date stay at the top,
  the list scrolls, **Close** (primary, focused) stays at the bottom.
- A version with no entry (a hand-made build): nothing opens by itself; the menu shows "What's new" with every version open.
- Text only: every note goes through `escHtml`.

### Code
- **src/notes.js** — classic script (not a module, so `scripts/check-notes.js` can run it in `vm`):
  `window.BohpumNotes = { KINDS, NOTES, noteFor, earlierNotes, shouldShow }`, same shapes as Sastra PDF. `NOTES` frozen,
  newest first: `{ version, date: 'YYYY-MM-DD', notes: [{ kind, text }] }`. Loaded by index.html before app.js.
- **src/app.js** — `openNotes(version)` next to `openAbout`: `modal(title, body, [['Close', null, true]], 'notes')`, Close
  focused; `m.done` → `api.setSettings({ notesSeen: version })`. `notesAtStart()` at the end of `init()` (after the welcome
  screen): `api.appInfo()` → `shouldShow(version, S.settings.notesSeen)` → `openNotes`; then `<html data-notes>` =
  `shown | none` (tests wait on it). `cmd('whats-new')` → `openNotes` unless `#modal-root` has a box.
- **main.js** — Help: `{ label: "What's New", click: () => send('whats-new') }` before About.
- **scripts/check-notes.js** — runs src/notes.js in `vm`; exit 1 with a plain list when the newest entry is not
  package.json's version, a version is listed twice, an entry has no date (YYYY-MM-DD) or no notes, or a note has an
  unknown kind or empty text. Run first by `pnpm run dist`.
- **Release step (README)**: after changing the version in package.json, write the new entry at the top of src/notes.js.

### Stacked boxes (needed for "on top of the welcome screen")
`modal()`'s Esc / Enter handler acts only when its box is the top one (`#modal-root`'s last child): today Esc would close
the welcome screen and What's new together. Lower boxes register their handler earlier, so they run first, see they are
not on top and step aside. A button with `data-enter-self` keeps Enter for itself (the "See earlier versions" link), so
Enter on it opens the list instead of closing the box.

### Content (draft for the user to check)
**0.1.0 · 2026-10-17** — the first release:
- New: Open Microsoft Publisher (.pub) files, edit them and print them. Save them as Bohpum files (.bpum); the .pub is never changed.
- New: Text boxes with Khmer and English text, shapes, lines and pictures, on many pages with a master page.
- New: A Print screen like Publisher: one card anywhere on A4, or many copies on one sheet, with a preview you can zoom. Save as PDF saves exactly what would print.
- New: Right-click .pub files in File Explorer → Convert to Bohpum.
- New: Drag pages in the Pages panel to change their order. Make the panel wider or narrower by dragging its edge.
- New: Each section of the panel on the right folds and opens from its heading, and stays that way after a restart.
- New: System, Light and Dark themes, and Maximize to give the page the whole window.
- New: This What's new window. It opens once after each update. Open it again from Help › What's New.

## 2. Right panel sections fold
- Every `.psec` heading becomes a button `.psec-head` (`aria-expanded`) across the panel: the green icon and the name on the
  left, a muted chevron on the right (up = open; turns 180° when folded, .15 s, none with reduced motion). Click / Enter /
  Space folds only that section (`.psec.folded`: everything but the heading hidden); again opens it. Hover = `--chrome-2`,
  focus-visible = the accent outline.
- Folding is per kind of section, not per object: `section(P, title, icon, key)` with keys `object` (the first section:
  Text box / Rectangle / Picture / "3 objects selected"), `arrange`, `fill`, `shape`, `textbox`, `picture`, `line`,
  `opacity`, `master`, `pagesize`, `margins`, `background`. A folded "Fill & line" stays folded for every shape.
- Remembered in settings: `propsFolded` = list of folded keys (empty list when none). All open by default. The panel is
  rebuilt on every selection change, so `section()` reads the list each time; a click only toggles the class (no rebuild,
  the focus stays on the heading).
- Page shortcuts already ignore Enter / Space on a focused button (onKey), so they don't edit text or pan.

## 3. Arrange buttons leave the top bar
Asked mid-way ("we can move some tool from the top bar to the sidebar" → only the **Arrange buttons**; text bar, zoom and
drawing tools stay).
- The toolbar group Bring to front / Send to back / Group / Ungroup is removed from `#topbar`. The right panel's **Arrange**
  section (shown whenever something is selected) already has the four Order buttons.
- Arrange gains a **Group** row: two buttons with icon + word, **Group** (Ctrl+G) and **Ungroup** (Ctrl+Shift+G), each
  disabled when it would do nothing (Group: fewer than 2 items, or they are already one group; Ungroup: no grouped item).
  The Group / Ungroup buttons in the first section's button row go (no copies); Lock stays there.
- Unchanged: the shortcuts, the Arrange menu and the right-click menu.

## Testing (tests/*.test.js, the real app)
- **whats-new.test.js**: fresh profile → `data-notes=shown`; the box is the top one, over the welcome screen; title "What's
  new in <package.json version>", the date, one tag per line in kind order, no "See earlier versions"; Close focused; Esc
  closes only it (welcome stays) and settings.json has `notesSeen`; reload → `data-notes=none`; Help › What's New with the
  welcome open → nothing; welcome closed → it opens; a short window (800 × 420): the list scrolls, Close in view; New tag =
  accent in light and dark; check-notes passes on the real file and fails on a wrong newest version, a duplicate, a missing
  date, an unknown kind.
- **props-fold.test.js**: headings are buttons, icon left, chevron at the right edge; click folds only that section
  (controls hidden, `aria-expanded=false`, chevron turned), the others unchanged; click opens; Enter on a focused heading
  folds and nothing else happens; folded `fill` stays folded on another rectangle; reload → still folded; unfolding all
  saves an empty list.
- **arrange-panel.test.js**: the top bar has no front / back / group / ungroup button; one rectangle selected → Arrange has
  Order and Group (Group and Ungroup disabled); two selected → Group enabled, clicking it groups them, then Ungroup enabled
  and Group disabled; Ungroup splits them; the first section's buttons hold Lock only.
- **harness.js** `ready()`: waits for `data-notes`, closes What's new when it is shown, then the welcome screen as before.
  props-icons.test.js reads the icon inside the heading button. All earlier suites pass.
