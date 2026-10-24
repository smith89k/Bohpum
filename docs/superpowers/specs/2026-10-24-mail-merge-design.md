# Mail merge, as in Publisher — design

Date: 2026-10-24 · Status: approved by the user in chat ("yes"), after the builder check
Asked by the user: "there is no mail merge function" → "like publisher" → cards / certificates, one per person, from an
Excel list → "photo too" → for photos: "copy file as path in Windows, and paste in Excel. that's it." → after the
builder check: cards with a front and a back → yes, a sheet of fronts then a sheet of matching backs; a name too long for
its box → shrink the letters to fit, for that person only.

## Why

People who move from Publisher to Bohpum print name cards, ID cards, invitations and certificates for many people at
once. In Publisher they do this with mail merge: an Excel list, one row per person, blanks in the design that are filled
from the list, a preview, then one print of everyone. Bohpum has no way to do this, so today each person's card has to be
typed by hand. Success: someone who used Publisher's mail merge can do the same job in Bohpum without being taught,
including a photo per person, and Khmer names come out right.

## Goals

1. Use an Excel list as the source: one row per person, the first row holds the column names.
2. Put fields (blanks such as «Name») into text boxes; each field is filled from that person's row.
3. Make a picture a **photo field**: each person's photo comes from a column of the list.
4. Choose who is printed: a list of the people with a tick box each.
5. Step through the people and see each one's card on the page before printing.
6. Print everyone in one go — on the Print screen as it is now, including several cards per A4 sheet and Save as PDF.
7. The publication remembers its list, so reopening it is enough to print again.

## Non-goals (not now)

- Email merge, catalog merge (many people in a table on one page), envelopes / labels wizards.
- Outlook contacts, Access, or typing a new list inside Bohpum.
- Conditional filters and sorting rules ("only rows where…"); the tick boxes are the way to choose people.
- "Merge to a new publication" (one editable page per person). Save as PDF covers keeping the result.
- Carrying over a mail merge set up inside an old .pub file.

## Anti-goals (a failure even if it works)

- Bohpum changes, locks or re-saves the Excel file, or the photo files.
- Photos are copied into the .bpum file (it would grow by megabytes per person). They are read from disk each time.
- A publication without a list looks or behaves any differently, or opens slower. Opening .pub files is untouched.
- Khmer text in the list or in column names comes out broken (wrong letters, wrong order, boxes).
- Bohpum goes online for any of this.
- One missing photo stops the whole print without saying who it is.

## How it works for the user

### The Mailings menu
A new top menu **Mailings**, between Arrange and View (the order Publisher uses), Alt+M:
- **Select list…** — pick an Excel file (`.xlsx`, `.xls`) or a `.csv`. If the workbook has more than one sheet, ask
  which sheet (the first sheet is chosen by default). Choosing a list again replaces the old one; fields whose column is
  missing in the new list are shown as missing (see Problems).
- **Choose people…** — a box with the whole list as a table: a tick box per row (all ticked at first), Tick all / Untick
  all, and a search box that filters the rows shown. Columns as in the file.
- **Insert field** ▸ — a sub-menu of the column names. Greyed out unless the cursor is in a text box.
- **Photo from list…** — for the selected picture: pick the column that holds the photos. Greyed out unless one picture is
  selected.
- **Preview** (toggle) — shows real people instead of the «Name» blanks.
- **Remove list** — the publication forgets its list; fields turn back into plain text showing their name, photo fields
  into ordinary pictures (their last shown picture, or empty).

Everything but Select list is greyed out while the publication has no list.

### Fields in text
- A field is one piece in the text, shown as «Column name» with a light tint so it reads as a blank. It moves, copies,
  deletes and undoes as one piece. It takes the font, size, colour and bold etc. of where it sits, like any text, and that
  formatting is what the person's value is printed with.
- In Preview the field shows that person's value instead. Empty cell → nothing.
- Fields may also be placed on the master page.

### Photo fields
- The column holds each person's photo as a **full path**, the way the user makes it: in File Explorer, right-click the
  photo → **Copy as path**, then paste in Excel. Windows puts quotes around it ("C:\Photos\Sokha.jpg"); Bohpum takes them
  off, and also ignores spaces around it.
- If a cell holds only a file name (Sokha.jpg), Bohpum looks for it in the Excel file's own folder. (Builder's call
  whether to also ask for a photos folder when many are not found.)
- The photo goes into the picture's frame using the frame's own fit setting; the frame's size and place never change per
  person.
- No photo (empty cell, or the file isn't there) → the frame is printed empty.
- Formats: the ones Insert picture takes today (png, jpg, jpeg, gif, bmp, webp, svg).

### The preview bar
While the publication has a list, a slim bar sits above the page: **◀ Person 3 of 40 ▶**, the person's first column value
(usually the name), a Preview on/off switch, and a "Choose people" button. The arrows step through the ticked people only.
The page, the Pages panel thumbnails and the right panel show that person while Preview is on. Editing with Preview on
edits the design (the fields), not the person's data — typing over a shown value is not allowed: clicking a field selects
it whole.

### Printing
When the publication has a list, the Print screen gets one more choice at the top, **Who**: **Everyone ticked**
(default) / **Only the person showing** / **No one (the design with blanks)**. Everything else in the Print screen stays
as it is. With Everyone ticked:
- Each person gets the publication's chosen pages (all, current, or a range — the range counts within one person's
  pages). 40 people × 1 page = 40 cards.
- "Many per sheet" puts different people side by side (the cards go in person order: sheet 1 has persons 1–10, …), not
  copies of one person. Copies prints the whole batch that many times.
- The preview's sheet count and the "x sheets" info count all people. Save as PDF saves the whole batch.
- The existing **Page order** choice under "Many per sheet" stays, renamed for a list: **Different people side by
  side** (default, as above) / **A full sheet of each person** (10 of Sokha's card, then 10 of the next person's — the
  old "Fill each sheet with one page"). With "Only the person showing", a full sheet of that one person. *(Builder check —
  my call.)*
- **Front and back** (the user's answer: needed, the way of ID cards). When each person has two pages (page 1 the front,
  page 2 the back) and Many per sheet is chosen, the batch prints as a sheet of fronts, then a sheet of the matching
  backs, then the next fronts sheet, and so on. On the backs sheet each row's order is reversed (the card that was at the
  left is at the right) so that, printed on both sides of the paper and flipped on the long edge, every back lands behind
  its own front. The Print screen shows a **Front and back** tick (on by default when each person has exactly two pages)
  and a **Flip on: long edge / short edge** choice (long edge default; for short edge the cards stay in their columns
  and the rows are reversed instead, top to bottom — this follows the sheet's orientation). The printer's own two-sided setting is the user's to switch on (Printer
  preferences, as today). With more than two pages per person, pages go in pairs (1–2, 3–4 …). Untick it to get the plain
  person-order layout.
- **Names too long for the box** (the user's answer: shrink to fit). For each person, a text box that holds a field and
  whose text doesn't fit its box is shrunk for that person only: every font size in the box goes down in small equal
  steps until it fits, no smaller than 60 % of the design's sizes. The design itself is never changed; the preview shows
  the shrunk text, so what is seen is what prints. If it still doesn't fit at the smallest size, that person is listed in
  the warning below ("Row 12 · … · the text doesn't fit its box"). Text boxes without fields are left as today.
- **Other ways out** *(builder check — my call)*: File › Save as PDF (outside the Print screen) saves everyone ticked,
  with the same warnings; Export page as PNG saves the person showing (the design with blanks when Preview is off).
- Before printing or saving: if any ticked person has a missing photo or a field whose column is gone, a box lists them
  ("Row 5 · សុខ ដារា · photo not found: C:\Photos\dara.jpg") with **Print anyway** / **Cancel**. Missing values just print
  empty.
- Large batches show progress and must not freeze the window; 300 people with photos is the size to plan for.

### Saving and opening
- The .bpum file stores the list's full path, the sheet name, which people are unticked, and the photo column per
  picture. Fields live inside the text. The list's data itself is not stored; it is read fresh from the file each time the
  publication is opened (so edits in Excel show up).
- Unticked people are remembered by the row's content, not its row number, so adding rows in Excel doesn't untick the
  wrong people. New rows come in ticked.
- On open, if the list file is gone or can't be read (e.g. it's open and locked in Excel), say so in plain words and offer
  **Find the list…** / **Later**. The design still opens and shows «Name» blanks.
- Older Bohpum versions opening a file with fields: they would show the field's text. That's acceptable.

### Problems shown in plain words
- A field whose column isn't in the list (renamed in Excel, or a new list chosen): shown as «Name ?» in red-ish tint in
  the editor, and listed in the warning before print.
- An empty list, or a list with no header row: "This list has no people in it" / "The first row should hold the column
  names."

## Constraints

- Works offline, on the Store version (which has the Publisher reader inside) and needs nothing else installed — no
  Excel on the PC.
- Khmer in cell values and column names; also numbers and dates as Excel shows them (a date cell prints as it looks in
  Excel, not as a serial number). *(Builder check — my call:)* this means Excel's common built-in formats — dates and
  times, whole and decimal numbers, thousands separators, percent, currency, text cells kept as typed (leading zeros in
  phone and ID numbers stay). Unusual custom formats may print as the plain value; that's acceptable.
- Follow the app's look and its existing parts: the `modal` boxes, the Print screen (`src/print.js`), the menus in
  `main.js` with `MENU_KEYS` in `src/app.js`, undo via `commit()`.
- The text cleaner (`sanitizeHtml` / `cleanAttrs` in `src/textedit.js`) already keeps `data-field` (used for the page
  number field from .pub import, `<span data-field="page">`); merge fields should fit the same pattern and survive
  copy/paste and the cleaner.
- Read files in the main process (as `pick-images` does); the window gets the data.
- Tests follow the existing real-app tests in `tests/`, with a sample list (Khmer names) and a few small photos in
  `samples/` or the test folder.

## Left to the builder

- How to read .xlsx / .xls / .csv (a small reader of the .xlsx zip, a library, or the Publisher reader for .xls) — as long
  as the constraints hold. CSV in UTF-8 (with or without BOM); older Excel CSV in the Windows code page is a nice-to-have.
- How the field is stored in the text (e.g. `<span data-field="merge" …>`), and the exact look of the tint.
- The preview bar's exact layout and where Preview's on/off state is kept (not saved in the file is fine).
- The What's new entry: write it with the release that ships this.
