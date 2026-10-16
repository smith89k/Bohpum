// Print dialog picks the printer and prints straight to it; landscape sheets go out as portrait
// paper with the content turned; the last printer is remembered; no printers → Print disabled.
const { app } = require('electron');
const { run } = require('./harness');

const jobs = [];
const FAKE = [
  { name: 'Office HP', displayName: 'Office HP', isDefault: false },
  { name: 'Front Desk Canon', displayName: 'Front Desk Canon', isDefault: true }
];

run(async (t, check) => {
  let printers = FAKE;
  t.wc.getPrintersAsync = async () => printers.map(p => ({ ...p, description: '', status: 0, options: {} }));
  await t.ready();
  const openPrint = async () => {
    await t.js('window.__bohpumApp.cmd("print")');
    await t.waitFor('!!document.querySelector(".print-preview .slot") && document.getElementById("pd-printer").options[0].textContent !== "Finding printers…"');
  };
  const set = (selector, value, ev) => t.js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event(${JSON.stringify(ev)}, { bubbles: true })); })()`);
  const ui = () => t.js(`(() => {
    const s = document.getElementById('pd-printer');
    return {
      options: [...s.options].map(o => o.value), selected: s.value, disabled: s.disabled,
      props: !!document.getElementById('pd-props') && !document.getElementById('pd-props').disabled,
      heads: [...document.querySelectorAll('.print-side .psec h4')].map(h => h.textContent),
      printLabel: document.querySelector('[data-a="print"]').textContent, printDisabled: document.querySelector('[data-a="print"]').disabled,
      pdfDisabled: document.querySelector('[data-a="pdf"]').disabled, firstOption: s.options[0] && s.options[0].textContent
    };
  })()`);

  await openPrint();
  const u1 = await ui();
  check('Printer list shows the installed printers, Windows default selected',
    u1.options.join('|') === 'Office HP|Front Desk Canon' && u1.selected === 'Front Desk Canon' && u1.props && !u1.disabled, u1);
  check('Left column: Printer, Paper, Layout, Pages, Printer adjustment', u1.heads.join('|') === 'Printer|Paper|Layout|Pages|Printer adjustment', u1.heads);
  check('Print button says Print (no Windows dialog follows)', u1.printLabel === 'Print', u1.printLabel);

  await set('#pd-printer', 'Office HP', 'change');
  await set('[data-k="orient"]', 'landscape', 'change');
  await t.waitFor('!!document.querySelector(".print-preview .slot")');
  await set('[data-k="copies"]', '2', 'input');
  await t.click('.modal-f [data-a="print"]');
  await t.waitFor('!document.querySelector(".print-preview")', 20000);
  const toastText = await t.js('document.getElementById("toast").textContent');
  const job = jobs[0];
  check('Print goes straight to the chosen printer', job && job.opts.silent === true && job.opts.deviceName === 'Office HP' && job.opts.copies === 2, job && job.opts);
  check('Landscape A4 goes out as portrait A4 with the content turned',
    job && job.opts.pageSize === 'A4' && job.opts.landscape === false && job.sheet.turned &&
    Math.round(job.sheet.w) === 794 && Math.round(job.sheet.h) === 1123 &&
    /@page \{ size: 210mm 297mm/.test(job.sheet.css) && /rotate\(-90deg\)/.test(job.sheet.css), job && { ...job.sheet, css: undefined });
  check('Says where it was sent', toastText === 'Sent 1 sheet to Office HP', { toastText });

  await openPrint();
  const u2 = await ui();
  check('Last printer is remembered', u2.selected === 'Office HP', u2);
  await t.key('Escape');

  printers = [];
  await openPrint();
  const u3 = await ui();
  check('No printers: says so, Print disabled, Save as PDF still works',
    u3.firstOption === 'No printers installed' && u3.disabled && !u3.props && u3.printDisabled && !u3.pdfDisabled, u3);
  await t.key('Escape');
}, {
  setup: () => {
    let seen = 0;
    app.on('browser-window-created', (_e, w) => {
      if (seen++ === 0) return; // the editor window
      // Hidden print window: record the job instead of printing on paper
      w.webContents.print = (opts, cb) => {
        w.webContents.executeJavaScript(`(() => { const s = document.querySelector('.sheet-out'), r = s.getBoundingClientRect(); return { w: r.width, h: r.height, turned: !!s.querySelector('.sheet-turn'), css: document.querySelector('style').textContent }; })()`)
          .then((sheet) => { jobs.push({ opts, sheet }); cb(true, ''); }, (err) => { jobs.push({ opts, err: String(err) }); cb(false, String(err)); });
      };
    });
  }
});
