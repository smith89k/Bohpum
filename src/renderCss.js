// Page rendering CSS, shared by the editor and printed / exported output.
export const RENDER_CSS = `
/* Shared by the editor and by print / PDF output. Everything is in real units (mm, pt). */
.kpage { position: relative; background: #fff; overflow: hidden; }
.klayer { position: absolute; inset: 0; }
.kobj { position: absolute; box-sizing: border-box; transform-origin: 50% 50%; }
.kobj > svg.kshape { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.kimg > .kimg-clip { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; }
.kimg-clip > img { position: absolute; display: block; max-width: none; pointer-events: none; user-select: none; }
.kimg > img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; pointer-events: none; user-select: none; }
.kimg .kimg-missing { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center;
  font: 9pt sans-serif; color: #8a5a00; background: repeating-linear-gradient(45deg, #fff6e0, #fff6e0 2mm, #ffeec4 2mm, #ffeec4 4mm); outline: 0.2mm dashed #d39b00; }
.ktext { position: absolute; inset: 0; display: flex; flex-direction: column; box-sizing: border-box; }
.ktext.va-top { justify-content: flex-start; }
.ktext.va-middle { justify-content: center; }
.ktext.va-bottom { justify-content: flex-end; }
.kt { white-space: pre-wrap; overflow-wrap: break-word; line-height: normal; outline: none; tab-size: 12.7mm;
  -webkit-font-smoothing: antialiased; font-kerning: normal; min-height: 1em; }
.kt p { margin: 0; min-height: 1em; }
.kt table { border-collapse: collapse; width: 100%; }
.kt td, .kt th { border: 0.2mm solid #000; padding: 0.5mm 1mm; vertical-align: top; }
/* as in Publisher, a paragraph's space after isn't added after a cell's last paragraph (nothing follows it), so a
   row keeps the height the file gives it */
.kt td > p:last-child, .kt th > p:last-child { margin-bottom: 0 !important; }
.kcrop { position: absolute; background: #000; }
`;
