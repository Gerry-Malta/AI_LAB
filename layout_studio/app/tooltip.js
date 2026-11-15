// Hover help: rest the cursor on a control for about half a second and a short explanation appears beside it.
// Sources, in order: data-tip="Title|Explanation" on the element or a parent; a title attribute (moved to data-tip, so
// the browser's own tooltip does not double it); a property row (.field) whose input has a data-f listed in `tips`.
const DELAY = 550;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Tip for a property key: exact, without a trailing index (position.0), keys A/B and acting joints folded together. */
export function tipForField(tips, key) {
  if (!key) return '';
  const k = String(key);
  const cands = [k, k.replace(/\.\d+$/, '.0'), k.replace(/\.\d+$/, ''), k.replace(/^keys\.[AB]\./, 'keys.K.').replace(/\.\d+$/, ''), k.split('.')[0]];
  for (const c of cands) if (tips[c]) return tips[c];
  return '';
}

export function installTooltips(tips = {}) {
  const tip = document.createElement('div'); tip.id = 'tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip);
  let timer = 0, target = null, x = 0, y = 0;
  const textFor = (el) => {
    if (el.dataset.tip) return el.dataset.tip;
    if (el.classList.contains('field')) { const f = el.querySelector('[data-f]'); return f ? tipForField(tips, f.dataset.f) : ''; }
    return '';
  };
  const find = (node) => {
    for (let el = node; el && el.nodeType === 1 && el !== document.body; el = el.parentElement) {
      const t = el.getAttribute('title');
      if (t) { el.dataset.tip = t; el.removeAttribute('title'); }
      if (el.dataset.tip || (el.classList.contains('field') && textFor(el))) return el;
    }
    return null;
  };
  const hide = () => { clearTimeout(timer); tip.classList.remove('show'); };
  const show = () => {
    const text = target && target.isConnected ? textFor(target) : ''; if (!text) return;
    const [head, ...rest] = text.split('|');
    tip.innerHTML = rest.length ? `<b>${esc(head)}</b><span>${esc(rest.join('|'))}</span>` : `<span>${esc(head)}</span>`;
    tip.classList.add('show');
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 20;
    if (left + r.width > innerWidth - 8) left = innerWidth - r.width - 8;
    if (top + r.height > innerHeight - 8) top = y - r.height - 12;
    tip.style.left = `${Math.max(8, left)}px`; tip.style.top = `${Math.max(8, top)}px`;
  };
  document.addEventListener('pointermove', (e) => {
    x = e.clientX; y = e.clientY;
    if (e.buttons) { hide(); target = null; return; } // dragging, flying: no help popping up
    const el = find(e.target);
    if (el !== target) { hide(); target = el; }
    if (el && !tip.classList.contains('show')) { clearTimeout(timer); timer = setTimeout(show, DELAY); } // shows once the cursor rests
  }, { passive: true });
  for (const ev of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(ev, hide, { capture: true, passive: true });
  document.addEventListener('scroll', hide, { capture: true, passive: true });
  document.documentElement.addEventListener('pointerleave', () => { hide(); target = null; });
  return { hide };
}
