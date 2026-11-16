// Review notes: the director, the VFX supervisor and the artists write notes on the whole scene and on single shots,
// and draw on frames. One interface, two stores:
//  - shared (the page opened as a claude.ai artifact): identity from the viewer's claude.ai account (`user`), notes live
//    in the artifact's shared database (`db`), annotated frames uploaded as assets (`assets`); roles assigned by the owner;
//  - local (GitHub Pages, a local server): a local profile (name + role) kept in this browser, notes stored in the scene
//    file itself (`scene.review`), so they travel with it.
// Notes are plain data: { id, authorId, role, scene, shot, t, text, markup, snapshot, parent, created, resolved }.
// Markup strokes are in frame fractions (u from the left, v from the top), so they redraw at any size.

export const ROLES = { director: 'Director', vfx: 'VFX supervisor', artist: 'Artist' };
export const ROLE_COLORS = { director: '#ff6b5e', vfx: '#ffcf5a', artist: '#78d68f' };
const LOCAL_ME = 'layoutstudio.review.me';
const uid = (p = 'n') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };

/** Resolve a claude.ai capability, or null when this page runs anywhere else (or the viewer has not granted it). */
async function capability(name) {
  const c = globalThis.claude;
  if (!c || typeof c.use !== 'function') return null;
  try { return await c.use(name); } catch (e) { return null; }
}

/**
 * Open the review store for a scene. ctx: { sceneKey, getScene, markDirty, onChange }.
 * Returns the store: { mode, me(), signIn(), signOut(), team(), setRole(), notes(), add(), update(), remove(),
 * setResolved(), uploadSnapshot(), canWrite, canAssign, describe() }.
 */
export async function openReviewStore(ctx) {
  const [db, user] = await Promise.all([capability('db'), capability('user')]);
  if (db && user) {
    try { return await sharedStore(ctx, db, user); } catch (e) { console.warn('review: shared store unavailable, using local notes', e); }
  }
  return localStore(ctx);
}

// ------------------------------------------------------------------ local store ------------------------------------------
function localStore(ctx) {
  let me = lsGet(LOCAL_ME);
  const review = () => { const s = ctx.getScene(); if (!s) return { notes: [] }; s.review = s.review || { notes: [] }; s.review.notes = s.review.notes || []; return s.review; };
  const changed = () => { ctx.markDirty(); ctx.onChange(); };
  return {
    mode: 'local',
    describe: () => 'Local profile, stored in this browser. Notes are saved in the scene file (Save JSON keeps them).',
    me: () => (me ? { id: me.id, name: me.name, role: me.role, color: ROLE_COLORS[me.role], verified: false } : null),
    get canWrite() { return !!me; },
    get canAssign() { return false; },
    signIn(name, role) { me = { id: (me && me.id) || uid('u'), name: String(name || '').trim().slice(0, 60) || 'Anonymous', role: ROLES[role] ? role : 'artist' }; lsSet(LOCAL_ME, me); ctx.onChange(); },
    signOut() { me = null; lsSet(LOCAL_ME, null); ctx.onChange(); },
    team: () => { const seen = new Map(); for (const n of review().notes) if (!seen.has(n.authorId)) seen.set(n.authorId, { id: n.authorId, name: n.authorName, role: n.role }); if (me) seen.set(me.id, { id: me.id, name: me.name, role: me.role }); return [...seen.values()]; },
    setRole() { /* local profiles choose their own role at sign-in */ },
    async names(ids) { const out = {}; for (const id of ids) { const n = review().notes.find((x) => x.authorId === id); out[id] = { name: (n && n.authorName) || (me && me.id === id ? me.name : ''), avatarUrl: null, color: null }; } return out; },
    notes: () => review().notes.filter((n) => n.scene === ctx.sceneKey()),
    async add(note) { if (!me) throw new Error('Sign in to write notes.'); const n = Object.assign({ id: uid(), authorId: me.id, authorName: me.name, role: me.role, scene: ctx.sceneKey(), created: new Date().toISOString(), resolved: null }, note); review().notes.push(n); changed(); return n; },
    async update(id, patch) { const n = review().notes.find((x) => x.id === id); if (!n) return; Object.assign(n, patch, { edited: new Date().toISOString() }); changed(); },
    async remove(id) { const r = review(); r.notes = r.notes.filter((x) => x.id !== id && x.parent !== id); changed(); },
    async setResolved(id, on) { const n = review().notes.find((x) => x.id === id); if (!n || !me) return; n.resolved = on ? { by: me.id, byName: me.name, at: new Date().toISOString() } : null; changed(); },
    // a small JPEG kept inside the scene file: the frame as it was when the note was written
    async uploadSnapshot(canvas) { return canvas.toDataURL('image/jpeg', 0.72); },
    close() {},
  };
}

// ------------------------------------------------------------------ shared store (claude.ai) -----------------------------
// Database layout (rules declared at publish):
//   review/roles        { roles: { <userId>: 'director' | 'vfx' | 'artist' } }   — the owner and editors assign roles
//   notes/<userId>      { items: { <noteId>: note }, resolutions: { <noteId>: { on, at } } } — each person writes only
//                       their own document; everyone reads all of them. A note counts as resolved when its author or
//                       a director / VFX supervisor last marked it so.
async function sharedStore(ctx, db, user) {
  const meV = await user.me();
  const assets = await capability('assets');
  const canWriteShared = await user.can('data.write');
  let roles = {}, docs = new Map(), ready = false;
  const myRef = meV.id ? db.doc(`notes/${meV.id}`) : null;
  // one write at a time per document: queue them
  let chain = Promise.resolve();
  const queue = (fn) => (chain = chain.then(fn, fn));
  const unsubs = [];
  await new Promise((resolve) => {
    const timer = setTimeout(() => { ready = true; resolve(); }, 10000);
    let gotRoles = false, gotNotes = false;
    const maybe = () => { if (gotRoles && gotNotes && !ready) { ready = true; clearTimeout(timer); resolve(); } };
    unsubs.push(db.doc('review/roles').onSnapshot((s) => { roles = (s.exists && s.data().roles) || {}; gotRoles = true; maybe(); ctx.onChange(); }, () => { gotRoles = true; maybe(); }));
    unsubs.push(db.collection('notes').onSnapshot((q) => { docs = new Map(q.docs.map((d) => [d.id, d.data()])); gotNotes = true; maybe(); ctx.onChange(); }, () => { gotNotes = true; maybe(); }));
  });
  // the page's owner directs until roles say otherwise; everyone else writes as an artist until given a role
  const roleOf = (id) => roles[id] || (id === meV.id && meV.isOwner ? 'director' : 'artist');
  // the owner's role is written on their first action, so the others see their resolutions as the director's
  const ensureOwnerRole = async () => { if (meV.isOwner && meV.id && !roles[meV.id]) { const ref = db.doc('review/roles'); const cur = await ref.get(); const r = Object.assign({}, (cur.exists && cur.data().roles) || {}); if (!r[meV.id]) { r[meV.id] = 'director'; await ref.set({ roles: r }); roles = r; } } };
  const allItems = () => {
    const items = [], resol = new Map();
    for (const [author, d] of docs) {
      for (const [id, n] of Object.entries((d && d.items) || {})) items.push(Object.assign({}, n, { id, authorId: author, role: n.role || roleOf(author) }));
      for (const [id, r] of Object.entries((d && d.resolutions) || {})) { const prev = resol.get(id); if (!prev || r.at > prev.at) resol.set(id, Object.assign({ by: author }, r)); }
    }
    for (const n of items) {
      const r = resol.get(n.id);
      const allowed = r && (r.by === n.authorId || ['director', 'vfx'].includes(roleOf(r.by)));
      n.resolved = allowed && r.on ? { by: r.by, at: r.at } : null;
    }
    return items;
  };
  const writeMine = (mutate) => queue(async () => {
    if (!myRef) throw new Error('Sign in to claude.ai to write notes.');
    const cur = (await myRef.get());
    const body = cur.exists ? JSON.parse(JSON.stringify(cur.data())) : { items: {}, resolutions: {} };
    body.items = body.items || {}; body.resolutions = body.resolutions || {};
    mutate(body);
    await myRef.set(body);
  });
  return {
    mode: 'shared',
    describe: () => 'Signed in with your claude.ai account. Notes are shared live with everyone who opens this page.',
    me: () => (meV.id ? { id: meV.id, name: meV.name || 'You', role: roleOf(meV.id), color: ROLE_COLORS[roleOf(meV.id)], avatarUrl: meV.avatarUrl, verified: true, isOwner: meV.isOwner } : null),
    get canWrite() { return !!meV.id && canWriteShared !== false; },
    get canAssign() { return !!(meV.isOwner || meV.canEdit); },
    signIn() {}, signOut() {},
    team: () => { const ids = new Set([...Object.keys(roles), ...docs.keys()]); if (meV.id) ids.add(meV.id); return [...ids].map((id) => ({ id, role: roleOf(id) })); },
    async setRole(id, role) {
      if (!ROLES[role]) return;
      const ref = db.doc('review/roles');
      await queue(async () => { const cur = await ref.get(); const r = Object.assign({}, (cur.exists && cur.data().roles) || {}, { [id]: role }); await ref.set({ roles: r }); });
    },
    async search(q) { return user.search ? user.search(q) : []; },
    async names(ids) { return user.profiles(ids); },
    notes: () => allItems().filter((n) => n.scene === ctx.sceneKey()),
    async add(note) {
      await ensureOwnerRole().catch(() => {});
      const n = Object.assign({ id: uid(), scene: ctx.sceneKey(), role: roleOf(meV.id), created: new Date().toISOString() }, note);
      const { id, ...body } = n; delete body.authorId; delete body.resolved;
      await writeMine((d) => { d.items[id] = body; });
      return n;
    },
    async update(id, patch) { await writeMine((d) => { if (d.items[id]) Object.assign(d.items[id], patch, { edited: new Date().toISOString() }); }); },
    async remove(id) { await writeMine((d) => { delete d.items[id]; for (const [k, v] of Object.entries(d.items)) if (v.parent === id) delete d.items[k]; }); },
    async setResolved(id, on) { await ensureOwnerRole().catch(() => {}); await writeMine((d) => { d.resolutions[id] = { on: !!on, at: new Date().toISOString() }; }); },
    async uploadSnapshot(canvas) {
      if (!assets) return canvas.toDataURL('image/jpeg', 0.6).length < 90000 ? canvas.toDataURL('image/jpeg', 0.6) : null;
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
      try { const a = await assets.upload(blob); return a.url || `/_blob/${a.id}`; } catch (e) { return null; }
    },
    close() { for (const u of unsubs) try { u(); } catch (e) { /* closed */ } },
  };
}

// ------------------------------------------------------------------ markup ------------------------------------------------
/** Draw markup strokes onto a 2D context of size w × h. */
export function drawMarkup(g, markup, w, h) {
  for (const s of markup || []) {
    const pts = (s.pts || []).map(([u, v]) => [u * w, v * h]);
    if (!pts.length) continue;
    g.save();
    g.strokeStyle = s.color || '#ff6b5e'; g.fillStyle = s.color || '#ff6b5e';
    g.lineWidth = Math.max(2, (s.w || 0.004) * w); g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 2;
    if (s.tool === 'pen') { g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.stroke(); }
    else if (s.tool === 'ellipse' && pts.length > 1) {
      const [a, b] = [pts[0], pts[pts.length - 1]];
      g.beginPath(); g.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2 || 1, Math.abs(b[1] - a[1]) / 2 || 1, 0, 0, Math.PI * 2); g.stroke();
    } else if (s.tool === 'arrow' && pts.length > 1) {
      const [a, b] = [pts[0], pts[pts.length - 1]], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), hl = Math.max(10, g.lineWidth * 4);
      g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
      g.beginPath(); g.moveTo(...b); g.lineTo(b[0] - hl * Math.cos(ang - 0.45), b[1] - hl * Math.sin(ang - 0.45)); g.lineTo(b[0] - hl * Math.cos(ang + 0.45), b[1] - hl * Math.sin(ang + 0.45)); g.closePath(); g.fill();
    } else if (s.tool === 'text' && s.text) {
      g.font = `600 ${Math.round(0.035 * h)}px Arial, sans-serif`; g.textBaseline = 'top'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.strokeText(s.text, ...pts[0]); g.fillText(s.text, ...pts[0]);
    }
    g.restore();
  }
}

/**
 * Open the frame markup editor over an element: the frozen frame as the background, pen / arrow / ellipse / text
 * tools, undo, and Save → resolves { markup, canvas (frame + markup, for the snapshot) } or null when cancelled.
 */
export function openMarkupEditor({ host, rect, frame, color = '#ff6b5e', title = 'Note on this frame' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'markup-editor';
    Object.assign(wrap.style, { position: 'absolute', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, zIndex: 40 });
    const cv = document.createElement('canvas'); cv.width = Math.round(rect.width * (devicePixelRatio || 1)); cv.height = Math.round(rect.height * (devicePixelRatio || 1));
    Object.assign(cv.style, { width: '100%', height: '100%', cursor: 'crosshair', display: 'block', touchAction: 'none' });
    const bar = document.createElement('div'); bar.className = 'markup-bar';
    bar.innerHTML = `<span class="markup-title"></span>
      <button data-tool="pen" class="small active" data-tip="Pen|Draw freehand on the frame.">✎ pen</button>
      <button data-tool="arrow" class="small" data-tip="Arrow|Drag from the tail to the point.">➚ arrow</button>
      <button data-tool="ellipse" class="small" data-tip="Ellipse|Drag a box around what you mean.">◯ circle</button>
      <button data-tool="text" class="small" data-tip="Text|Click where the words go.">T text</button>
      <input type="color" class="markup-color" value="${color}" data-tip="Colour|Your role's colour by default.">
      <button data-act="undo" class="small" data-tip="Undo|Remove the last mark (Ctrl+Z).">undo</button>
      <button data-act="cancel" class="small">Cancel</button>
      <button data-act="save" class="small primary">Save marks</button>`;
    bar.querySelector('.markup-title').textContent = title;
    wrap.append(cv, bar); host.appendChild(wrap);
    const g = cv.getContext('2d');
    const strokes = []; let tool = 'pen', cur = null;
    const paint = () => { g.clearRect(0, 0, cv.width, cv.height); g.drawImage(frame, 0, 0, cv.width, cv.height); drawMarkup(g, cur ? strokes.concat([cur]) : strokes, cv.width, cv.height); };
    paint();
    const uvOf = (e) => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
    const colorIn = bar.querySelector('.markup-color');
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); cv.setPointerCapture(e.pointerId);
      const p = uvOf(e);
      if (tool === 'text') { const text = prompt('Text on the frame'); if (text) { strokes.push({ tool, color: colorIn.value, pts: [p], text: text.slice(0, 80) }); paint(); } return; }
      cur = { tool, color: colorIn.value, w: 0.004, pts: [p] };
    });
    cv.addEventListener('pointermove', (e) => { if (!cur) return; const p = uvOf(e); if (cur.tool === 'pen') cur.pts.push(p); else cur.pts = [cur.pts[0], p]; paint(); });
    const end = () => { if (cur && (cur.pts.length > 1 || cur.tool === 'pen')) strokes.push(Object.assign({}, cur, { pts: cur.pts.map(([u, v]) => [+u.toFixed(4), +v.toFixed(4)]) })); cur = null; paint(); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    const close = (result) => { window.removeEventListener('keydown', onKey, true); wrap.remove(); resolve(result); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); e.stopPropagation(); strokes.pop(); paint(); } };
    window.addEventListener('keydown', onKey, true);
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) { tool = b.dataset.tool; bar.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('active', x === b)); }
      if (b.dataset.act === 'undo') { strokes.pop(); paint(); }
      if (b.dataset.act === 'cancel') close(null);
      if (b.dataset.act === 'save') {
        const out = document.createElement('canvas'); out.width = Math.min(960, frame.width); out.height = Math.round(out.width * frame.height / frame.width);
        const og = out.getContext('2d'); og.drawImage(frame, 0, 0, out.width, out.height); drawMarkup(og, strokes, out.width, out.height);
        close({ markup: strokes, canvas: out });
      }
    });
  });
}

/** Markdown of the notes of a scene, for the review session (who, role, shot, time, text, status). */
export function notesMarkdown(sceneTitle, notes, nameOf, shotName, secondsOf = (n) => n.t) {
  const L = [`# Review notes · ${sceneTitle}`, ''];
  const top = notes.filter((n) => !n.parent).sort((a, b) => (a.shot ? 1 : 0) - (b.shot ? 1 : 0) || String(a.created).localeCompare(String(b.created)));
  const replies = (id) => notes.filter((n) => n.parent === id).sort((a, b) => String(a.created).localeCompare(String(b.created)));
  for (const n of top) {
    const sec = n.shot ? secondsOf(n) : null;
    const where = n.shot ? `Shot ${shotName(n.shot)}${sec != null ? ` @ ${sec.toFixed(1)} s` : ''}` : 'Scene';
    L.push(`- **${where}** · ${nameOf(n.authorId) || 'Someone'} (${ROLES[n.role] || n.role}) · ${String(n.created).slice(0, 16).replace('T', ' ')}${n.resolved ? ' · ✓ resolved' : ''}${n.markup && n.markup.length ? ' · ✎ frame marked' : ''}`);
    L.push(`  ${String(n.text || '').replace(/\n/g, '\n  ')}`);
    for (const r of replies(n.id)) L.push(`  - ${nameOf(r.authorId) || 'Someone'} (${ROLES[r.role] || r.role}): ${String(r.text || '').replace(/\n/g, ' ')}`);
  }
  return L.join('\n') + '\n';
}
