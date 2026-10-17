// Closing with unsaved changes asks in the app's own box (as in Sastra PDF), never a Windows message box:
// Save / Don't save / Cancel. Cancel (or a cancelled Save) keeps the window; ✕ twice shows one box only.
const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');

const native = [], answers = [];

run(async (t, check) => {
  await t.ready();
  app.removeAllListeners('window-all-closed'); // keep the app running after the window closes, to report
  await t.js('window.__bohpumApp.cmd("page-add")'); // unsaved
  const box = () => t.js(`(() => { const bs = [...document.querySelectorAll('#modal-root .modal-back')];
    return bs.map(b => ({ title: (b.querySelector('.modal-h') || {}).textContent, text: b.querySelector('.modal-b').textContent, buttons: [...b.querySelectorAll('.modal-f .btn')].map(x => x.textContent) })); })()`);
  const press = async (label) => {
    await t.js(`(() => { const b = [...document.querySelectorAll('#modal-root .modal-back:last-child .modal-f .btn')].find(x => x.textContent === ${JSON.stringify(label)}); b.id = 'press-me'; return true; })()`);
    await t.click('#press-me'); await t.sleep(300);
  };

  t.win.close(); await t.sleep(400);
  const b1 = await box();
  check('Closing with unsaved changes asks in the app\'s own box: Save · Don\'t save · Cancel',
    b1.length === 1 && b1[0].title === 'Save changes first?' && b1[0].buttons.join(' · ') === "Save · Don't save · Cancel", b1);
  check('No Windows message box', native.length === 0, native);

  await press('Cancel');
  check('Cancel keeps the window and the changes', !t.win.isDestroyed() && (await box()).length === 0 && await t.js('window.__bohpumApp.state.dirty'), null);

  t.win.close(); await t.sleep(150); t.win.close(); await t.sleep(400);
  const b2 = await box();
  check('✕ clicked twice shows one box only', b2.length === 1, b2.length);

  await press('Save'); // the Save As box is cancelled
  check('Save, then cancelling the Save As box, keeps the window', !t.win.isDestroyed() && (await box()).length === 0, null);

  const out = path.join(t.ctx.tmp, 'closed.bpum');
  answers.push(out);
  t.win.close(); await t.sleep(400);
  await press('Save'); await t.sleep(600);
  check('Save writes the file, then the window closes', fs.existsSync(out) && t.win.isDestroyed(), { saved: fs.existsSync(out), closed: t.win.isDestroyed() });
  check('Still no Windows message box', native.length === 0, native);
}, {
  setup: () => {
    dialog.showMessageBoxSync = (...a) => { native.push(a[a.length - 1].message); return 2; };
    dialog.showMessageBox = async (...a) => { native.push(a[a.length - 1].message); return { response: 0 }; };
    dialog.showSaveDialog = async () => { const p = answers.shift(); return p ? { canceled: false, filePath: p } : { canceled: true }; };
  }
});
