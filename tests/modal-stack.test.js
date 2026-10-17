// Two of the app's boxes at once (New publication or What's new over the welcome screen): Esc and Enter belong to
// the top box only, so closing it leaves the box underneath open. A button marked data-enter-self keeps Enter.
const { run } = require('./harness');

run(async (t, check) => {
  t.win.focus(); t.wc.focus();
  await t.waitFor('!!window.__bohpumApp && !!document.querySelector(".welcome-modal")');
  await t.sleep(600);
  const boxes = () => t.js(`[...document.getElementById('modal-root').children].map(b => (b.querySelector('.modal-h') || {}).textContent || b.querySelector('.modal').className)`);
  const start = await boxes();
  await t.js('window.__bohpumApp.cmd("new")'); await t.sleep(300);
  const two = await boxes();
  check('New publication opens on top of the welcome screen', two.length === start.length + 1 && two[two.length - 1] === 'New publication', two);
  await t.key('Escape');
  check('Esc closes only the top box', (await boxes()).join('|') === start.join('|'), await boxes());

  await t.js('window.__bohpumApp.cmd("new")'); await t.sleep(300);
  await t.key('Enter');
  check('Enter presses the top box\'s button only (the welcome screen stays)', (await boxes()).join('|') === start.join('|'), await boxes());

  await t.js('window.__bohpumApp.cmd("new")'); await t.sleep(300);
  await t.js(`(() => { const b = document.createElement('button'); b.id = 'own-enter'; b.dataset.enterSelf = ''; b.textContent = 'x';
    b.onclick = () => { window.__ownEnter = (window.__ownEnter || 0) + 1; };
    document.querySelector('#modal-root .modal-back:last-child .modal-b').append(b); b.focus(); return true; })()`);
  await t.key('Enter');
  const own = await t.js('window.__ownEnter || 0'), after = await boxes();
  check('A data-enter-self button keeps Enter: it is clicked and the box stays', own === 1 && after.length === start.length + 1, { own, after });
});
