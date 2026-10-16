# Publisher-style print screen and custom dropdowns: design

Date: 2026-10-16 · Status: approved by the user in chat (mockups in the visual companion), before implementation
Builds on: `2026-10-16-titlebar-theme-print-saveas-design.md` (branch `feature/titlebar-theme-print-saveas`)

## Goal
1. The print screen fills the Bohpum window, like Publisher's print screen, instead of a fixed box.
2. Its left column is a stack of big Publisher-style dropdowns (picture · bold title · one line of explanation).
3. Every dropdown in Bohpum gets our own look instead of the Windows one.

Decided in chat: mockup **D** (big dropdowns, not the compact one-line variant, not the Tidy / Sastra /
Cards variants); size = **fill Bohpum** (not drag-to-resize, not a separate window).

## Technique: customizable `<select>`
Electron 44.8.0 = Chromium 152, which supports `appearance: base-select` (checked: `CSS.supports` true,
computed `appearance` = `base-select`). A prototype in Electron showed: options holding a picture and
two lines of text, `<button><selectedcontent></selectedcontent></button>` mirroring the chosen option in
the closed box, a real mouse click opening the list (`:open`) and picking an option (value + `change`).
So every dropdown stays a real `<select>`: keyboard, `change` events, `.value` and the existing code and
tests keep working. No hand-made dropdown component.

## 1. Custom dropdowns everywhere (`src/app.css`)
- `select, ::picker(select) { appearance: base-select; }` for all dropdowns: toolbar zoom, line spacing,
  the properties panel (`select()` helper in `app.js`), Page Setup, the print screen.
- Closed: white, 1 px `--line-2` border, 6 px radius, our chevron (`::picker-icon` drawn as a turned
  corner, `--ink-2`; turns up and goes green while open); open or keyboard-focused → `--accent` border +
  `#cfe8d9` ring; disabled → 50 % opacity.
- Open list (`::picker(select)`): white, 1 px `--line-2`, 8 px radius, shadow `0 10px 30px rgba(0,0,0,.18)`,
  4 px padding. Option: 6 px 8 px padding, 5 px radius; hover → `--chrome`; chosen → `--accent-soft` with a
  green tick (`::checkmark`) at the right.
- Simple dropdowns keep their current sizes (`.zoom-sel` 76 px wide, `.field` 26–28 px high).
- Unchanged: the Font and Size boxes (typed fields with suggestions, `<input list>`), colour pickers.

## 2. Print screen fills Bohpum (`src/print.js`, `src/app.css`)
- The print screen's backdrop gets class `print-screen`: it starts under the title row (`top: 37px`),
  covers the rest of the window, no dimmed backdrop, no rounded box. The title row stays usable: move,
  maximize, close.
- While any dialog is open (`#modal-root` not empty) the title row's menu words are greyed out and do
  nothing (`openMenu` returns; CSS `pointer-events: none`), so no menu command runs behind the print screen.
- Layout: slim header "Print"; left column 340 px, scrolls on its own; preview fills the rest; footer as
  today (status text · Close · Save as PDF · Print).
- Window resized / maximized / restored → the preview re-fits (window `resize` listener, 100 ms debounce,
  removed on close).

## 3. Left column, Publisher style (`src/print.js`)
Top to bottom:
1. **Copies** (number, 1–999).
2. **Printer** heading → big dropdown `#pd-printer`: printer picture · printer name · "Default printer" or
   "Printer". Loading: one option "Finding printers…"; none: "No printers installed" (disabled; Print
   disabled; Save as PDF works). Under it a **Printer Properties** link (button styled as a link,
   `#pd-props`, opens Windows' printing preferences as today).
3. **Settings** heading, each a big dropdown:
   - **Pages** (`data-k="pages"`): *Print All Pages* · "The whole publication (N pages)" / *Print Current
     Page* · "Page N" / *Custom Print* · "Type which pages to print". Custom Print shows a **Pages** text
     box (`data-k="range"`, e.g. `1-3, 5`) under it.
   - **Layout** (`data-k="mode"`): *One per sheet, at a position* · "Place the page anywhere on the paper" /
     *Multiple copies per sheet* · "N per sheet (c × r)" or "Page is larger than the paper" / *Page size =
     paper size* · "Print on W × H mm paper". Under it, only when needed:
     - position: **Left** / **Top** (mm) + a 3×3 position pad (9 small buttons `data-pos` tl…br, same snap
       points as today: 10 mm from the edges or centred; the one matching the current position is green);
     - multiple: Top / Left / Bottom / Right margins, Gap ↔ / Gap ↕, "Center the block on the sheet",
       order dropdown (simple style).
   - **Paper** (`data-k="sheet"`): A4 · "210 × 297 mm", A3, A5, Letter, Legal (sizes from `SHEETS`).
   - **Orientation** (`data-k="orient"`): *Portrait Orientation* · "Tall sheet" / *Landscape Orientation* ·
     "Wide sheet".
   - Paper and Orientation are disabled for *Page size = paper size* (they don't apply).
   - **Crop marks** tick box (disabled for *Page size = paper size*, as today).
4. **Printer adjustment** heading → **Move right** / **Move down** (mm) = today's X / Y, same note.
5. Warnings (page outside the paper, printer edge) at the bottom, as today.

Big dropdown = `<select class="big">` with `<button><selectedcontent></selectedcontent></button>` and
options `<span class="ic">(svg)</span><span class="t"><b>title</b><small>explanation</small></span>`;
min-height 48 px, full column width; picture 30 px square, `--accent-soft` background, `--accent` icon.

Behaviour kept from today: settings saved on the publication (also on Close / Esc when changed), printer
and printer adjustment app-wide, direct printing, landscape turn, drag on the preview.

## Testing (Electron harness, `npm test`)
- `tests/dropdowns.test.js`: every `select` in the editor, the properties panel and the print screen has
  computed `appearance: base-select`; a real click opens the zoom dropdown, a real click on "100%" picks
  it (zoom changes); keyboard: focus the line-spacing dropdown, open with Enter, ArrowDown + Enter picks the
  next value.
- `tests/print-screen.test.js`: the print screen starts at the title row's bottom and fills the rest of the
  window; menu words do nothing while it is open; after `win.setSize` the screen still fills the window and
  the preview sheet is re-fitted; the Layout dropdown opened and picked with the mouse switches to
  Multiple (margins appear, Left/Top go); Custom Print shows the Pages box; the 3×3 pad's top-left button
  puts the card at Left 10 / Top 10 and lights that cell; Paper / Orientation disabled for Page size =
  paper size; the closed Layout dropdown shows the chosen title.
- `tests/print-direct.test.js`: section headings become Printer · Settings · Printer adjustment; option
  text checks allow the explanation line; everything else unchanged.
- All earlier checks keep passing.

## Out of scope
Drag-to-resize, a separate print window, Publisher's "Print one sided / both sides" and colour dropdowns,
restyling the Font / Size typed boxes, dark theme.
