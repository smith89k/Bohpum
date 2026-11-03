# Table and picture tools — design

Approved with the user on 2026-11-03. Build order: tables first, then pictures; one plan.

## Why

Publisher files with tables (e.g. a 268-page voucher template, pages 11 on) now open as text boxes holding an HTML
table (fix in `odgImport.js`: a table frame's fallback StarView picture is ignored). But Bohpum has no idea the box
is a table: the right panel only shows text box options, and the file's column widths, row heights and cell padding
are lost. Pictures have only Fit, Border, Weight, Replace and Original ratio.

Transparency (its own section) and free rotation (angle box, round handle) already exist for every object and are
not part of this work.

## Part 1 — Tables

### Where the table lives

The table stays inside a text box (`type: 'box'`, `o.html` holds `<table>…</table>`), as today. No new object type:
saving, printing, PDF, mail merge fields in cells and typing in cells keep working, and older `.bpum` files open
unchanged. Rejected: a new `table` object type (rework of save, print, merge and text editing for no user-visible gain).

All table settings are inline CSS in `o.html`:

| What | Stored as |
|---|---|
| Column widths | `<table style="table-layout:fixed">` + `<colgroup><col style="width:NN%">…</colgroup>`, percentages of the box width, so resizing the box scales the columns |
| Row height (a minimum; text can still grow it) | `<tr style="height:Nmm">` |
| Cell colour | `td` `background-color` |
| Cell border (all four sides of a cell) | `td` `border-style`, `border-width`, `border-color` |
| Cell padding | `td` `padding` |
| Text position | `td` `vertical-align: top / middle / bottom` |

A table without these keeps today's look from `renderCss.js` (`.kt td`: 0.2 mm solid black, padding 0.5 × 1 mm, top).

`textedit.js` `sanitizeHtml` must keep them: add `COLGROUP` and `COL` to the allowed tags, and keep `width`, `height`,
`padding`, `border-style`, `border-width`, `border-color` and `table-layout` — only on `TABLE`, `COLGROUP`, `COL`,
`TR`, `TD`, `TH`, so pasted text can't bring sizes into spans and paragraphs.

### New module `src/table.js`

Pure DOM functions on a `<table>` element, no app state, so they can be tested alone:

- `grid(table)` — the cell map: for each row and column, which `td` covers it (handles `colspan` / `rowspan`).
- `cellsBetween(table, tdA, tdB)` — every cell in the rectangle spanned by two cells (grows to include whole merged cells).
- `insertRow(table, td, 'above' | 'below')`, `insertColumn(table, td, 'left' | 'right')` — the new row copies the
  height and cell styles of the row it is next to; the new column copies the width and cell styles of its neighbour.
  A merged cell that crosses the insertion line grows its `rowspan` / `colspan` instead of getting a new cell.
- `deleteRow(table, td)`, `deleteColumn(table, td)` — a merged cell crossing the deleted line shrinks its span; a
  merged cell that starts in the deleted row/column moves down/right with its text and a span one smaller. Refused
  (returns false) for the last row or column.
- `setCellStyle(cells, { fill, borderWidth, borderColor, padding, valign })` — only the given keys change.
- `columnWidthsMm(table, boxW)` / `setColumnWidthsMm(table, mm[])` — convert between `%` and mm.

### Which cells the Table section works on

- Typing cursor in a cell: that cell (and its row / column for insert and delete).
- A text selection across cells: `cellsBetween` of the cells at the two ends.
- The box selected but not being edited: every cell; insert / delete use the last row / column.

### The Table section in the right panel

Shown, after the Text section, for a single selected box whose `html` holds a table (`section(P, 'Table', …, 'table')`).

- **Rows & columns:** Insert row above, Insert row below, Insert column left, Insert column right, Delete row,
  Delete column. Delete is greyed out when only one row / column is left.
  The box grows or shrinks with them, as in Publisher: a new row adds its height to the box, a new column adds its
  width (other columns keep their mm widths); deleting takes it away again.
- **Cell colour:** the app's colour field, with "No Colour".
- **Border:** weight list None, 0.25, 0.5, 0.75, 1, 1.5, 2.25 pt, and a line colour field.
- **Cell padding:** one number in mm.
- **Text position:** Top / Middle / Bottom buttons.

Every change is one Undo step. While the box is being edited, the change is made to the live text so the typing
cursor stays in the same cell; otherwise it goes through `setProp`.

### Opening Publisher files

`tableHtml` in `odgImport.js` also reads, from the converted file:
- column widths (`table-column` styles, `style:column-width`, repeated with `table:number-columns-repeated`) → `colgroup`;
- row heights (`table-row` styles, `style:row-height`) → `tr` height;
- cell padding, fill and vertical alignment (`table-cell` styles) → `td` styles;
- cell borders (`fo:border*`) when present. LibreOffice's Publisher import gives none for the sample template, so those
  tables keep the default thin black lines.

## Part 2 — Pictures

### New picture settings (all optional; missing = normal)

| Field | Values |
|---|---|
| `crop` | `{ l, t, r, b }`: the share of the original picture cut off on each side, 0–0.95; `null` = none |
| `bright` | −100 … +100, 0 = normal |
| `contrast` | −100 … +100, 0 = normal |
| `recolor` | `'normal'`, `'gray'`, `'bw'`, `'washout'` |
| `flipH`, `flipV` | booleans |

The photo itself (`src`) is never changed. Older Bohpum versions ignore the new fields.

### Drawing (`render.js`, so screen, print, PDF and mail merge match)

- Filters on the `img`: CSS `brightness()` / `contrast()`; Grayscale = `grayscale(1)`; Washout = light and faded
  (brightness up, contrast down, as Publisher's Washout); Black & white = a threshold through an inline SVG
  `feComponentTransfer` filter (CSS alone can't make pure black and white).
- Flip: `transform: scale(-1, 1)` / `scale(1, -1)` on the `img` only, so the border and handles don't flip.
- Crop: the `img` sits in a clipping wrapper; it is sized and offset so that only the crop rectangle shows, and that
  rectangle is laid into the box by Fit (Stretch / Fit inside / Fill & crop) exactly as the whole picture is today.

### Picture section additions (right panel)

- **Crop** button: crop mode. Crop handles (black bars on the edges, corners) replace the size handles. Dragging one
  cuts that side: the frame shrinks and the picture stays where it is, same size. Enter, Escape, a click elsewhere
  or the Crop button again ends it. If Fit isn't Stretch when crop starts, the current look is first turned into
  Stretch without anything moving (Fit inside: the frame shrinks to the picture; Fill & crop: the hidden parts become
  the crop). **Reset crop** brings back the cut parts, growing the frame out again at the same scale.
- **Brightness** and **Contrast** sliders.
- **Recolour** list: Normal, Grayscale, Black & white, Washout.
- **Rotate left 90°**, **Rotate right 90°** (change `rot`, kept within 0–360), **Flip horizontal**, **Flip vertical**.
- **Reset picture**: crop, brightness, contrast, recolour and flip back to normal; size, position, rotation, border
  and transparency stay.

Every change is one Undo step.

### Opening Publisher files

When the converted file has them, read brightness (`draw:luminance`), contrast (`draw:contrast`), colour mode
(`draw:color-mode`: greyscale → Grayscale, mono → Black & white, watermark → Washout) and mirroring (`style:mirror`).
Not read: the crop (`fo:clip`). It is given in lengths of the photo's own printed size, which the converted file
doesn't state for every photo, so it can't be turned into shares of the photo reliably.

## Errors and limits

- Delete row / column on the last one: button greyed out; `table.js` also refuses.
- A table with broken spans (from an old file) is read by `grid()` leniently: missing cells count as empty.
- A crop that would leave less than 5 % of the picture on an axis is stopped there.
- A picture with no photo (missing / merge field without a photo) shows the settings but they have no visible effect.

## Testing

- `tests/import-table.test.js` (exists): table frame → text box with the table; extend with column widths, row
  heights and padding from a converted file.
- `table.js` functions: insert / delete with merged cells (the voucher's "Posted" header), last row/column refused,
  cell styles, `%` ↔ mm.
- Table section UI: each button, with the cursor in a cell, with cells selected across, with the whole box selected;
  Undo; save and reopen keeps everything; the sanitizer keeps the table styles and drops them from spans.
- Picture section UI: each control, crop mode drag and its Fit conversion, Reset crop, Reset picture, Undo, save and
  reopen, and print preview drawing the same as the editor.
- The user's TEMPLATE.pub: page 11 checked by eye against the file's real column widths and row heights.
