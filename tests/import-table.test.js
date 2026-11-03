// A Publisher table: LibreOffice writes it as a frame holding the table AND a fallback picture of it (an old
// StarView metafile no browser can show). Bohpum must keep the table as text, not show a "missing picture".
const { run } = require('./harness');

const FODG = `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 office:mimetype="application/vnd.oasis.opendocument.graphics">
 <office:styles>
  <style:style style:name="standard" style:family="graphic">
   <style:graphic-properties draw:stroke="solid" svg:stroke-width="0.106cm" svg:stroke-color="#127a02" draw:fill="solid" draw:fill-color="#18a303"/>
  </style:style>
 </office:styles>
 <office:automatic-styles>
  <style:style style:name="gr5" style:family="graphic" style:parent-style-name="standard"><style:graphic-properties/></style:style>
 </office:automatic-styles>
 <office:body><office:drawing>
  <draw:page draw:name="page1">
   <draw:frame draw:style-name="gr5" svg:width="6cm" svg:height="5cm" svg:x="1cm" svg:y="2cm">
    <table:table>
     <table:table-column/><table:table-column/>
     <table:table-row><table:table-cell table:number-columns-spanned="2"><text:p>Posted</text:p></table:table-cell><table:covered-table-cell/></table:table-row>
     <table:table-row><table:table-cell><text:p>DR</text:p></table:table-cell><table:table-cell><text:p>CR</text:p></table:table-cell></table:table-row>
    </table:table><draw:image><office:binary-data>VkNMTVRGAQAxAAAAAAAAAAEAGwAAAAAAAAAAAAAAAAABAAAAAQAAAAEAAAABAAAAAAwYAABP</office:binary-data></draw:image>
   </draw:frame>
  </draw:page>
 </office:drawing></office:body>
</office:document>`;

run(async (t, check) => {
  const { js } = t;
  await t.ready();
  const r = await js(`(async () => {
    const { importFodg } = await import('./odgImport.js');
    const doc = importFodg(${JSON.stringify(FODG)}, 'T');
    return doc.pages[0].objects.map(o => ({ type: o.type, html: o.html || '', src: o.src || '', note: o.note || '', fill: o.fill, stroke: o.stroke }));
  })()`);
  check('The table frame becomes one object', r.length === 1, r);
  check('…a text box, not a picture', r[0] && r[0].type === 'box', r);
  check('…holding the table and its words', r[0] && /<table/.test(r[0].html) && /Posted/.test(r[0].html) && /CR/.test(r[0].html), r);
  // the file's default shape style (green fill and outline here) is not painted behind a table, as in Publisher
  check('…with no fill or outline from the default shape style', r[0] && r[0].fill === 'none' && r[0].stroke === 'none', r);

  // Publisher files give each paragraph a space after it (here 4.94 mm). In a table cell Publisher doesn't add it after
  // the last paragraph: its 9 mm rows hold one 11 pt line. Adding it made every row 5 mm taller than the file says, so
  // the table spilled out of its box and the box's frame looked like a second box inside the table.
  const rows = await js(`(async () => {
    const { makeObject } = await import('./model.js'), { renderObject } = await import('./render.js');
    const p = (t) => '<p style="margin-bottom:4.94mm"><span style="font-size:11pt">' + t + '</span></p>';
    const o = makeObject('box', { x: 0, y: 0, w: 60, h: 18, shape: 'none', html: '<table><tr style="height:9mm"><td style="padding:0.97mm">' + p('DR') + '</td></tr><tr style="height:9mm"><td style="padding:0.97mm">' + p('one') + p('two') + '</td></tr></table>' });
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0';
    host.append(renderObject(o)); document.body.append(host);
    const mm = (el) => el.getBoundingClientRect().height / (96 / 25.4);
    const out = [...host.querySelectorAll('tr')].map(mm);
    host.remove(); return out;
  })()`);
  check('A cell with one line keeps the file’s 9 mm row (no space after its last paragraph)', rows[0] < 10.5, rows); // the line and padding only (14.8 mm with the space after)
  check('…while two paragraphs in a cell keep the space between them', rows[1] > rows[0] + 4.5, rows);
});
