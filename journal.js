/* ══════════════════════════════════════════════════════
   LIFE · TRADING JOURNAL  (journal.js, loaded after index.html's own script)
   Its own IndexedDB database (life_journal): trades, screenshots, settings, accounts, reviews.
   It never reads or writes life_game_save, except through the game's own completeMission() when a weekly review
   is linked to a mission you chose. Nothing runs while the journal is closed or the tab is hidden.
   Every piece of your text (notes, setups, rules, symbols, imported files) is escaped or set with textContent.
   ══════════════════════════════════════════════════════ */
(function () {
'use strict';
const JDB = 'life_journal', JDB_V = 1, JREV = 'life_journal_rev', JVER = 1, MIN = 20;
const J = { loaded: false, loading: null, ok: true, stale: false, rev: null, trades: [], set: null, accts: [], reviews: [], shotsBytes: 0,
  ver: 0, memo: new Map(), undo: [], redo: [], tab: 'overview', acct: 'all', calMonth: null, calMode: '$', selDay: null,
  f: { range: 'all', from: '', to: '', setup: 'all', src: 'all', sym: 'all', rules: 'all' }, sort: { k: 't', d: -1 }, q: '', detail: null };
window.JOURNAL = J;

/* ── small helpers ── */
const E = s => esc(String(s == null ? '' : s));
const num = v => { if (v === '' || v == null) return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : null; };
const r2 = v => Math.round(v * 100) / 100;
const money = (v, sign = true) => { if (v == null || !isFinite(v)) return '—'; const a = Math.abs(v); const s = a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return (sign ? (v > 0.004 ? '+' : v < -0.004 ? '−' : '') : (v < -0.004 ? '−' : '')) + '$' + s; };
const money0 = v => { if (v == null || !isFinite(v)) return '—'; return (v > 0.5 ? '+' : v < -0.5 ? '−' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US'); };
const rr = v => v == null || !isFinite(v) ? '—' : (v > 0.004 ? '+' : v < -0.004 ? '−' : '') + Math.abs(v).toFixed(2) + 'R';
const pct = v => v == null || !isFinite(v) ? '—' : (v * 100).toFixed(1) + '%';
const cls = v => v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : '';
const pad2 = n => String(n).padStart(2, '0');
const dkey = t => { const d = new Date(t); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const todayKey = () => dkey(Date.now());
const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SESSIONS = ['Asia', 'London', 'New York', 'After hours'];
/* session from the trade's UTC hour: Asia 00–07, London 07–13, New York 13–21, else after hours */
const sessionOf = t => { const h = new Date(t).getUTCHours(); return h < 7 ? 'Asia' : h < 13 ? 'London' : h < 21 ? 'New York' : 'After hours'; };
const hasR = t => t.risk != null && t.risk > 0;
const Rof = t => hasR(t) ? t.pnl / t.risk : null;
const jid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtTime = t => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDate = t => new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
function el(tag, attrs, text) { const e = document.createElement(tag); if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (text != null) e.textContent = text; return e; }

/* ── defaults and validation ── */
function defSettings() {
  return { v: JVER, setups: ['ICT Sweep-MSS-FVG', 'Godmode red dot', 'London breakout'], rules: ['Moved my stop', 'No valid setup', 'Revenge trade', 'Risked too much', 'Traded outside my session', 'Daily loss limit'],
    moods: ['Calm', 'Focused', 'Tired', 'FOMO', 'Revenge', 'Overconfident', 'Anxious'], syms: [{ s: 'XAUUSD', cs: 100 }, { s: 'EURUSD', cs: 100000 }, { s: 'US30', cs: 1 }, { s: 'NAS100', cs: 1 }],
    lastSym: 'XAUUSD', limit: 0, maxTrades: 0, goal: 0, reviewMission: '', shotsInBackup: null };
}
function defAcct() { return { id: 'acct-main', name: 'Main', start: 0, kind: 'real' }; }
const SRC = ['manual', 'bot', 'backtest'];
function cleanStr(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n || 120); }
function cleanTrade(t) {
  if (!t || typeof t !== 'object') return null;
  const time = +t.t; if (!isFinite(time) || time <= 0) return null;
  const n = v => { const x = num(v); return x == null ? null : x; };
  const o = {
    id: cleanStr(t.id || jid('t'), 60), acct: cleanStr(t.acct || 'acct-main', 60), t: time, close: isFinite(+t.close) && +t.close > 0 ? +t.close : null,
    sym: cleanStr(t.sym || 'XAUUSD', 20).toUpperCase(), dir: +t.dir === -1 ? -1 : 1,
    entry: n(t.entry), sl: n(t.sl), tp: n(t.tp), exit: n(t.exit), lot: n(t.lot), cs: n(t.cs), fees: n(t.fees) || 0,
    pnl: n(t.pnl), risk: n(t.risk), pnlTyped: !!t.pnlTyped, riskTyped: !!t.riskTyped, nostop: !!t.nostop,
    setup: cleanStr(t.setup, 60), src: SRC.includes(t.src) ? t.src : 'manual', rules: t.rules !== false, broke: cleanStr(t.broke, 80), mood: cleanStr(t.mood, 40),
    note: cleanStr(t.note, 4000).replace(/ {2,}/g, ' '), shots: Array.isArray(t.shots) ? t.shots.map(x => cleanStr(x, 60)).filter(Boolean).slice(0, 3) : [],
    quick: !!t.quick, pos: cleanStr(t.pos, 40), created: +t.created || Date.now(), updated: +t.updated || Date.now(), limitAck: !!t.limitAck,
  };
  if (o.note !== cleanStr(t.note, 4000)) o.note = String(t.note || '').slice(0, 4000);   /* keep line breaks in notes */
  if (o.pnl == null) return null;
  if (o.risk != null && !(o.risk > 0)) o.risk = null;
  return o;
}
function cleanSettings(s) {
  const d = defSettings(); if (!s || typeof s !== 'object') return d;
  const list = (a, n) => Array.isArray(a) ? [...new Set(a.map(x => cleanStr(x, n)).filter(Boolean))].slice(0, 200) : null;
  return {
    v: JVER, setups: list(s.setups, 60) || d.setups, rules: list(s.rules, 80) || d.rules, moods: list(s.moods, 40) || d.moods,
    syms: Array.isArray(s.syms) ? s.syms.filter(x => x && x.s).map(x => ({ s: cleanStr(x.s, 20).toUpperCase(), cs: num(x.cs) > 0 ? num(x.cs) : 1 })).slice(0, 100) : d.syms,
    lastSym: cleanStr(s.lastSym || 'XAUUSD', 20).toUpperCase(), limit: Math.max(0, num(s.limit) || 0), maxTrades: Math.max(0, Math.round(num(s.maxTrades) || 0)), goal: Math.max(0, num(s.goal) || 0),
    reviewMission: cleanStr(s.reviewMission, 120), shotsInBackup: s.shotsInBackup == null ? null : !!s.shotsInBackup,
  };
}
function cleanAcct(a) { if (!a || !a.id) return null; return { id: cleanStr(a.id, 60), name: cleanStr(a.name || 'Account', 40), start: Math.max(0, num(a.start) || 0), kind: ['real', 'demo', 'prop', 'backtest'].includes(a.kind) ? a.kind : 'real' }; }
function cleanReview(r) { if (!r || !r.id) return null; return { id: cleanStr(r.id, 60), week: cleanStr(r.week, 12), at: +r.at || Date.now(), text: String(r.text || '').slice(0, 2000), stats: r.stats && typeof r.stats === 'object' ? r.stats : {} }; }

/* ── storage (same pattern as the map: IndexedDB, a visible warning, a two-window guard) ── */
let dbP = null;
function jdb() {
  if (dbP) return dbP;
  dbP = new Promise((res, rej) => {
    try {
      if (!window.indexedDB) throw new Error('no indexedDB');
      const r = indexedDB.open(JDB, JDB_V);
      r.onupgradeneeded = () => { const db = r.result; ['trades', 'shots', 'kv'].forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
    } catch (e) { rej(e); }
  });
  return dbP;
}
const tx = (stores, mode, fn) => jdb().then(db => new Promise((res, rej) => {
  const t = db.transaction(stores, mode); let out; const r = fn(t); if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
  t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
}));
const getAll = s => tx([s], 'readonly', t => t.objectStore(s).getAll());
function warn(on, msg) { J.ok = !on; const w = document.getElementById('jn-warn'); if (w) { w.hidden = !on; if (on) w.textContent = msg || 'THIS BROWSER CANNOT SAVE THE JOURNAL. CHANGES WILL BE LOST WHEN YOU CLOSE LIFE.'; } }
function revOther() { try { const r = localStorage.getItem(JREV); return r && r !== J.rev && r.split(':')[0] !== TAB_ID; } catch (e) { return false; } }
function bumpRev() { const r = TAB_ID + ':' + Date.now(); J.rev = r; try { localStorage.setItem(JREV, r); } catch (e) {} }
function staleBar() {
  if (document.getElementById('jn-stale')) return;
  const b = el('div', { id: 'jn-stale', class: 'jn-stale', role: 'alert' });
  b.innerHTML = '<div><b>THE JOURNAL CHANGED IN ANOTHER WINDOW</b><span>Saving is paused here so nothing newer gets overwritten. Reload to continue.</span></div><button type="button" class="btn sm">RELOAD</button>';
  b.querySelector('button').onclick = () => location.reload(); document.body.appendChild(b);
}
function guard() { if (J.stale || revOther()) { J.stale = true; staleBar(); return false; } if (!J.ok) return false; return true; }
/* load and validate; if the stored data is broken, offer the raw data before resetting only the journal */
function load(force) {
  if (J.loaded && !force) return Promise.resolve();
  if (J.loading && !force) return J.loading;
  try { J.rev = localStorage.getItem(JREV); } catch (e) {}
  J.loading = Promise.all([getAll('trades'), getAll('kv')]).then(([ts, kv]) => {
    const raw = { trades: ts, kv };
    try {
      const meta = (kv || []).find(x => x.id === 'settings');
      J.set = cleanSettings(meta && meta.v);
      J.accts = ((kv || []).find(x => x.id === 'accounts') || { v: [] }).v; J.accts = (Array.isArray(J.accts) ? J.accts : []).map(cleanAcct).filter(Boolean); if (!J.accts.length) J.accts = [defAcct()];
      J.reviews = (((kv || []).find(x => x.id === 'reviews') || { v: [] }).v || []).map(cleanReview).filter(Boolean);
      const bad = (ts || []).filter(t => !cleanTrade(t));
      J.trades = (ts || []).map(cleanTrade).filter(Boolean).sort((a, b) => a.t - b.t);
      if (bad.length) { J.broken = { raw, bad: bad.length }; }
    } catch (e) { J.broken = { raw, all: true }; J.trades = []; J.set = defSettings(); J.accts = [defAcct()]; J.reviews = []; }
    J.loaded = true; J.ver++; J.memo.clear(); warn(false);
    return tx(['shots'], 'readonly', t => t.objectStore('shots').getAll()).then(sh => { J.shotsBytes = (sh || []).reduce((s, x) => s + ((x && x.size) || 0), 0); }).catch(() => {});
  }).catch(() => { J.set = J.set || defSettings(); J.accts = J.accts.length ? J.accts : [defAcct()]; J.loaded = true; warn(true); });
  return J.loading;
}
function saveKV(id, v) { if (!guard()) return Promise.resolve(); return tx(['kv'], 'readwrite', t => { t.objectStore('kv').put({ id, v }); }).then(bumpRev).catch(() => warn(true)); }
const saveSettings = () => saveKV('settings', J.set), saveAccts = () => saveKV('accounts', J.accts), saveReviews = () => saveKV('reviews', J.reviews);
function putTrades(list) { if (!guard()) return Promise.resolve(); return tx(['trades'], 'readwrite', t => { const s = t.objectStore('trades'); list.forEach(x => s.put(x)); }).then(bumpRev).catch(() => warn(true)); }
function delTrades(ids) { if (!guard()) return Promise.resolve(); return tx(['trades'], 'readwrite', t => { const s = t.objectStore('trades'); ids.forEach(id => s.delete(id)); }).then(bumpRev).catch(() => warn(true)); }
addEventListener('storage', e => {
  if (e.key !== JREV || !e.newValue || e.newValue.split(':')[0] === TAB_ID || !J.loaded) return;
  J.rev = e.newValue; load(true).then(() => { if (curPage === 'pg-journal') render(); });
});

/* ── one change at a time, each one undoable ── */
function changed() { J.ver++; J.memo.clear(); }
function applyOps(ops, record) {
  const puts = [], dels = [];
  ops.forEach(op => {
    const i = J.trades.findIndex(x => x.id === (op.next || op.prev).id);
    if (op.next) { if (i >= 0) J.trades[i] = op.next; else J.trades.push(op.next); puts.push(op.next); }
    else if (i >= 0) { J.trades.splice(i, 1); dels.push(op.prev.id); }
  });
  J.trades.sort((a, b) => a.t - b.t); changed();
  if (record) { J.undo.push(ops); if (J.undo.length > 60) J.undo.shift(); J.redo = []; }
  return Promise.all([puts.length ? putTrades(puts) : 0, dels.length ? delTrades(dels) : 0]);
}
const inv = ops => ops.slice().reverse().map(o => ({ prev: o.next, next: o.prev }));
function undo() { const ops = J.undo.pop(); if (!ops) return; J.redo.push(ops); applyOps(inv(ops), false); showToast('UNDONE'); render(); }
function redo() { const ops = J.redo.pop(); if (!ops) return; J.undo.push(ops); applyOps(ops, false); showToast('REDONE'); render(); }

/* ── the maths every number is built on (see the HOW IT'S CALCULATED tab) ── */
function stats(a) {
  const n = a.length; let gw = 0, gl = 0, wins = 0, losses = 0, be = 0, best = null, worst = null;
  const winR = [], lossR = [], allR = [], risks = [];
  for (const t of a) {
    if (t.pnl > 0) { gw += t.pnl; wins++; } else if (t.pnl < 0) { gl -= t.pnl; losses++; } else be++;
    if (best == null || t.pnl > best) best = t.pnl; if (worst == null || t.pnl < worst) worst = t.pnl;
    if (hasR(t)) { const r = t.pnl / t.risk; allR.push(r); if (t.pnl > 0) winR.push(r); else if (t.pnl < 0) lossR.push(r); risks.push(t.risk); }
  }
  const sorted = a.slice().sort((x, y) => x.t - y.t); let eq = 0, peak = 0, mdd = 0, streak = 0, maxStreak = 0, wstreak = 0, maxW = 0; const curve = [];
  for (const t of sorted) {
    eq += t.pnl; if (eq > peak) peak = eq; if (peak - eq > mdd) mdd = peak - eq; curve.push([t.t, eq, eq - peak]);
    if (t.pnl < 0) { streak++; if (streak > maxStreak) maxStreak = streak; wstreak = 0; } else if (t.pnl > 0) { streak = 0; wstreak++; if (wstreak > maxW) maxW = wstreak; }
  }
  const mean = x => x.length ? x.reduce((s, v) => s + v, 0) / x.length : null;
  const mr = mean(risks), sd = mr ? Math.sqrt(risks.reduce((s, x) => s + (x - mr) ** 2, 0) / risks.length) : 0;
  let cur = 0; for (let i = sorted.length - 1; i >= 0 && sorted[i].pnl < 0; i--) cur++;
  return { n, wins, losses, be, total: gw - gl, gw, gl, win: n ? wins / n : null, avgWinR: mean(winR), avgLossR: mean(lossR), pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : null),
    exp: mean(allR), nR: allR.length, mdd, maxStreak, maxW, curStreak: cur, best, worst, curve, meanRisk: mr, riskCv: mr ? sd / mr : 0, peak, rs: allR, sorted };
}
const group = (a, f) => { const m = new Map(); a.forEach(t => { const k = f(t); if (!m.has(k)) m.set(k, []); m.get(k).push(t); }); return [...m]; };
/* trades for the current account and filters, computed once per change */
function acctTrades() { return J.acct === 'all' ? J.trades : J.trades.filter(t => t.acct === J.acct); }
function rangeBounds() {
  const f = J.f, now = new Date(), t0 = dayStart(now); let from = -Infinity, to = Infinity;
  if (f.range === 'week') { const d = new Date(t0); const wd = (d.getDay() + 6) % 7; from = t0 - wd * 864e5; }
  else if (f.range === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  else if (f.range === '30' || f.range === '90') from = t0 - (+f.range - 1) * 864e5;
  else if (f.range === 'custom') { if (f.from) from = new Date(f.from + 'T00:00').getTime(); if (f.to) to = new Date(f.to + 'T00:00').getTime() + 864e5 - 1; }
  return [from, to];
}
function filtered() {
  const key = [J.ver, J.acct, JSON.stringify(J.f)].join('|');
  if (J.memo.has(key)) return J.memo.get(key);
  const f = J.f, [from, to] = rangeBounds();
  const a = acctTrades().filter(t => t.t >= from && t.t <= to && (f.setup === 'all' || t.setup === f.setup) && (f.src === 'all' || t.src === f.src) && (f.sym === 'all' || t.sym === f.sym) && (f.rules === 'all' || (f.rules === 'yes' ? t.rules : !t.rules)));
  const v = { a, s: stats(a) }; J.memo.set(key, v); return v;
}
J.stats = stats; J.filtered = filtered; J.sessionOf = sessionOf;

/* ── the auto-calculation used by the form, the quick log and the import ── */
function csFor(sym) { const s = (J.set.syms || []).find(x => x.s === String(sym || '').toUpperCase()); return s ? s.cs : (String(sym).toUpperCase() === 'XAUUSD' ? 100 : 1); }
function calc(i) {
  const cs = i.cs != null ? i.cs : csFor(i.sym), dir = i.dir === -1 ? -1 : 1, fees = i.fees || 0;
  const autoRisk = i.entry != null && i.sl != null && i.lot != null ? Math.abs(i.entry - i.sl) * i.lot * cs : null;
  const autoPnl = i.entry != null && i.exit != null && i.lot != null ? (i.exit - i.entry) * dir * i.lot * cs - fees : null;
  const risk = i.nostop ? null : (i.risk != null ? i.risk : autoRisk), pnl = i.pnl != null ? i.pnl : autoPnl;
  return { cs, risk, pnl, autoRisk, autoPnl, R: risk > 0 && pnl != null ? pnl / risk : null };
}
J.calc = calc;

/* ── daily loss limit ── */
function todayInfo() {
  const t0 = dayStart(Date.now()), ts = J.trades.filter(t => t.src !== 'backtest' && t.t >= t0 && t.t < t0 + 864e5);
  const pnl = ts.reduce((s, t) => s + t.pnl, 0), lim = J.set.limit, mx = J.set.maxTrades;
  return { ts, pnl, lim, mx, hit: (lim > 0 && pnl <= -lim + 1e-9) || (mx > 0 && ts.length >= mx), byLoss: lim > 0 && pnl <= -lim + 1e-9, byCount: mx > 0 && ts.length >= mx };
}
J.todayInfo = todayInfo;

/* ══════════════════════════════════════════════════════
   THE PAGE
   ══════════════════════════════════════════════════════ */
const TABS = [['overview', 'OVERVIEW'], ['setups', 'SETUPS'], ['time', 'TIME'], ['disc', 'DISCIPLINE'], ['risk', 'RISK'], ['trades', 'TRADES'], ['compare', 'BACKTEST VS LIVE'], ['reviews', 'WEEKLY REVIEW'], ['how', "HOW IT'S CALCULATED"]];
let built = false;
function build() {
  if (built) return; built = true;
  const pg = el('div', { id: 'pg-journal', class: 'scr jn', role: 'region', 'aria-label': 'Trading journal' });
  pg.innerHTML = `<div class="bg"><div class="vig"></div></div>
  <header class="top jn-top">
    <div class="back" data-jn="back" role="button" tabindex="0"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>BACK</div>
    <div class="jn-title"><span>TRADING</span><b>JOURNAL</b></div>
    <label class="jn-acct"><span class="sr">Account</span><select id="jn-acct" aria-label="Account"></select></label>
    <div class="jn-acts">
      <button type="button" class="btn sm jn-ib" data-jn="undo" aria-label="Undo" title="Undo (Ctrl+Z)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg></button>
      <button type="button" class="btn sm" data-jn="quick">QUICK LOG</button>
      <button type="button" class="btn pri" data-jn="new">+ LOG TRADE</button>
      <button type="button" class="btn sm" data-jn="more" aria-haspopup="true" aria-expanded="false" aria-label="More">⋯</button>
      <div class="jn-menu" id="jn-menu" hidden role="menu">
        <button type="button" role="menuitem" data-jn="import">IMPORT MT5 / CSV</button><button type="button" role="menuitem" data-jn="export">EXPORT CSV</button>
        <button type="button" role="menuitem" data-jn="review">WEEKLY REVIEW</button><button type="button" role="menuitem" data-jn="settings">JOURNAL SETTINGS</button></div>
    </div>
  </header>
  <div class="jn-warn" id="jn-warn" role="alert" hidden></div>
  <div class="jn-body" id="jn-body">
    <div class="jn-limit" id="jn-limit"></div>
    <details class="jn-filt" id="jn-filt" open><summary><span>FILTERS</span><em id="jn-fcount"></em></summary><div class="jn-fgrid" id="jn-fgrid"></div></details>
    <nav class="jn-tabs" id="jn-tabs" role="tablist"></nav>
    <main class="jn-main" id="jn-main" tabindex="-1"></main>
  </div>
  <div class="jn-sheet" id="jn-sheet" hidden role="dialog" aria-modal="true"><div class="jn-sheet-in" id="jn-sheet-in"></div></div>`;
  document.body.appendChild(pg);
  if (window.matchMedia && matchMedia('(max-width:640px)').matches) pg.querySelector('#jn-filt').open = false;
  pg.addEventListener('click', onClick);
  pg.addEventListener('change', onChange);
  pg.addEventListener('input', onInput);
  pg.addEventListener('keydown', onKey);
  $('jn-acct').addEventListener('change', e => { J.acct = e.target.value; J.selDay = null; render(); });
}
function open() {
  build();
  return load().then(() => {
    if (J.broken) brokenOffer();
    if (curPage !== 'pg-journal') { J.from = curPage; navigateTo('pg-journal'); }
    setTimeout(render, 470);
  });
}
J.open = open;
function close() { closeSheet(); navigateTo(J.from && J.from !== 'pg-journal' ? J.from : 'pg-profile'); }
function brokenOffer() {
  const B = J.broken; J.broken = null;
  const blob = new Blob([JSON.stringify(B.raw)], { type: 'application/json' }), url = URL.createObjectURL(blob);
  sheet(`<div class="jn-sh"><b>SOME JOURNAL DATA COULD NOT BE READ</b><button type="button" class="jn-x" data-jn="close" aria-label="Close">✕</button></div>
    <p class="jn-p">${B.all ? 'The journal data is damaged.' : `${B.bad} trade${B.bad > 1 ? 's were' : ' was'} damaged and left out.`} Download the raw data first, then you can reset only the journal. Your game is not affected.</p>
    <div class="jn-row"><a class="btn" href="${url}" download="life-journal-raw-${todayKey()}.json">DOWNLOAD RAW DATA</a><button type="button" class="btn danger" data-jn="reset-journal">RESET THE JOURNAL</button></div>`);
}

/* ── render ── */
function render() {
  if (!built || !J.loaded || curPage !== 'pg-journal' && !$('pg-journal').classList.contains('active')) return;
  const t0 = performance.now();
  const sel = $('jn-acct'); sel.textContent = '';
  [['all', 'All accounts']].concat(J.accts.map(a => [a.id, a.name + (a.kind !== 'real' ? ' · ' + a.kind : '')])).forEach(([v, l]) => { const o = el('option', { value: v }, l); if (v === J.acct) o.selected = true; sel.appendChild(o); });
  if (J.accts.length < 2) { sel.closest('.jn-acct').hidden = true; J.acct = 'all'; } else sel.closest('.jn-acct').hidden = false;
  renderLimit(); renderFilters();
  $('jn-tabs').innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" class="jn-tab ${J.tab === k ? 'on' : ''}" aria-selected="${J.tab === k}" data-tab="${k}">${l}</button>`).join('');
  const { a, s } = filtered(), m = $('jn-main');
  const V = { overview: vOverview, setups: vSetups, time: vTime, disc: vDisc, risk: vRisk, trades: vTrades, compare: vCompare, reviews: vReviews, how: vHow }[J.tab] || vOverview;
  m.innerHTML = (J.trades.length ? '' : emptyHTML()) + V(a, s);
  m.classList.remove('jn-in'); void m.offsetWidth; m.classList.add('jn-in');
  document.querySelectorAll('#pg-journal [data-jn="undo"]').forEach(b => b.disabled = !J.undo.length);
  J.lastRender = performance.now() - t0;
}
J.render = render;
J.reload = () => load(true).then(() => render());
function emptyHTML() { return `<div class="jn-empty"><b>Your journal is empty.</b><span>Log your first trade, use QUICK LOG right after you close one, or import your MetaTrader 5 history.</span><div class="jn-row"><button type="button" class="btn pri" data-jn="new">+ LOG TRADE</button><button type="button" class="btn" data-jn="import">IMPORT MT5 / CSV</button></div></div>`; }
function renderLimit() {
  const L = todayInfo(), box = $('jn-limit'), st = J.set;
  box.classList.toggle('hit', L.hit); box.hidden = !(st.limit > 0 || st.maxTrades > 0 || L.ts.length);
  const left = st.limit > 0 ? st.limit + L.pnl : null;
  box.innerHTML = L.hit
    ? `<b>${L.byLoss ? `Daily loss limit hit: ${money(L.pnl)} today.` : `Daily trade limit hit: ${L.ts.length} trades today.`} Stop trading for today.</b><span>Tomorrow is a new day. Any trade you log today counts as a rule break.</span>`
    : `<b>Today: <span class="${cls(L.pnl)}">${money(L.pnl)}</span> · ${L.ts.length} trade${L.ts.length === 1 ? '' : 's'}</b><span>${left != null ? `${money(left, false)} left before your daily loss limit` : ''}${st.maxTrades ? `${left != null ? ' · ' : ''}${Math.max(0, st.maxTrades - L.ts.length)} trades left today` : ''}${!st.limit && !st.maxTrades ? 'Set a daily loss limit in JOURNAL SETTINGS.' : ''}</span>`;
}
function renderFilters() {
  const f = J.f, all = acctTrades(), syms = [...new Set(all.map(t => t.sym))].sort(), setups = [...new Set(J.set.setups.concat(all.map(t => t.setup).filter(Boolean)))];
  const opt = (v, l, cur) => `<option value="${E(v)}" ${v === cur ? 'selected' : ''}>${E(l)}</option>`;
  $('jn-fgrid').innerHTML = `
    <label>DATES<select data-f="range">${[['all', 'All time'], ['week', 'This week'], ['month', 'This month'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['custom', 'Custom…']].map(x => opt(x[0], x[1], f.range)).join('')}</select></label>
    ${f.range === 'custom' ? `<label>FROM<input type="date" data-f="from" value="${E(f.from)}"></label><label>TO<input type="date" data-f="to" value="${E(f.to)}"></label>` : ''}
    <label>SETUP<select data-f="setup">${opt('all', 'All setups', f.setup)}${setups.map(x => opt(x, x, f.setup)).join('')}</select></label>
    <label>SOURCE<select data-f="src">${opt('all', 'All sources', f.src)}${opt('manual', 'Manual', f.src)}${opt('bot', 'Bot', f.src)}${opt('backtest', 'Backtest', f.src)}</select></label>
    <label>SYMBOL<select data-f="sym">${opt('all', 'All symbols', f.sym)}${syms.map(x => opt(x, x, f.sym)).join('')}</select></label>
    <label>RULES<select data-f="rules">${opt('all', 'All trades', f.rules)}${opt('yes', 'Followed', f.rules)}${opt('no', 'Broken', f.rules)}</select></label>`;
  const { a } = filtered(); $('jn-fcount').textContent = `${a.length} of ${all.length} trades`;
}

/* ── charts: plain SVG, theme colours through CSS ── */
function lineChart(pts, o = {}) {
  if (pts.length < 2) return '<div class="jn-none">Log at least 2 trades to see this chart.</div>';
  if (pts.length > 600) { const step = pts.length / 600, out = []; for (let i = 0; i < 600; i++) out.push(pts[Math.floor(i * step)]); out.push(pts[pts.length - 1]); pts = out; }
  const W = 640, H = o.h || 220, pl = 58, pr = 12, pt = 12, pb = 24, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  let y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys); if (y1 === y0) y1 = y0 + 1; const pad = (y1 - y0) * .08; y0 -= pad * (o.neg ? 1 : .3); y1 += pad;
  const X = x => pl + (x - xs[0]) / ((xs[xs.length - 1] - xs[0]) || 1) * (W - pl - pr), Y = y => pt + (y1 - y) / (y1 - y0) * (H - pt - pb);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
  const area = d + ` L${X(xs[xs.length - 1]).toFixed(1)} ${Y(0).toFixed(1)} L${X(xs[0]).toFixed(1)} ${Y(0).toFixed(1)} Z`;
  const ticks = [y0 + pad * (o.neg ? 1 : .3), 0, y1 - pad].filter((v, i, arr) => arr.findIndex(x => Math.abs(x - v) < (y1 - y0) * .1) === i);
  const dates = [0, .5, 1].map(f => xs[0] + f * (xs[xs.length - 1] - xs[0]));
  const fm = o.fmt || (v => money0(v).replace('+', ''));
  return `<svg class="jn-chart ${o.neg ? 'neg' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${E(o.label || 'Chart')}"><defs><linearGradient id="jg${o.neg ? 1 : 0}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s0"/><stop offset="1" class="s1"/></linearGradient></defs>
    ${ticks.map(v => `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" ${v ? 'stroke-dasharray="3 4"' : ''}/><text class="tx" x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${E(fm(v))}</text>`).join('')}
    ${dates.map((x, i) => `<text class="tx" x="${X(x).toFixed(1)}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][i]}">${E(new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }))}</text>`).join('')}
    <path d="${area}" fill="url(#jg${o.neg ? 1 : 0})"/><path class="ln" d="${d}" fill="none"/>${o.neg ? '' : `<circle class="dot" cx="${X(xs[xs.length - 1]).toFixed(1)}" cy="${Y(ys[ys.length - 1]).toFixed(1)}" r="4"/>`}</svg>`;
}
function bars(groups, o = {}) {
  const rows = groups.filter(g => g[1].length).map(([k, a]) => [k, a, stats(a)]); if (!rows.length) return '<div class="jn-none">No trades here yet.</div>';
  if (o.order) rows.sort((a, b) => (b[2].exp ?? -99) - (a[2].exp ?? -99));
  const m = Math.max(.5, ...rows.map(r => Math.abs(r[2].exp || 0)));
  return '<div class="jn-bars">' + rows.map(([k, a, s]) => { const v = s.exp || 0, w = Math.abs(v) / m * 50, enough = s.n >= MIN;
    return `<div class="jn-bar"><div class="k">${E(k)}<small>${s.n} trade${s.n === 1 ? '' : 's'} · ${pct(s.win)} win${enough ? '' : ` · few (${s.n}/${MIN})`}</small></div>
      <div class="tr"><span class="mid"></span><i class="${v >= 0 ? 'p' : 'n'} ${enough ? '' : 'few'}" style="left:${v >= 0 ? 50 : 50 - w}%;width:${w}%"></i></div>
      <div class="v ${cls(v)}">${s.nR ? rr(s.exp) : '<span class="jn-dim">no R</span>'}<small>${money0(s.total)}</small></div></div>`; }).join('') + '</div>';
}
const tr_ = n => `${n} trade${n === 1 ? '' : 's'}`;
const card = (l, v, c, h) => `<div class="jn-card"><div class="lab">${l}</div><div class="val ${c || ''}">${v}</div><div class="hint">${h || ''}</div></div>`;
const panel = (title, body, hint) => `<section class="jn-panel"><div class="jn-ph"><h3>${title}</h3>${hint ? `<span class="hint">${hint}</span>` : ''}</div>${body}</section>`;

/* ── insights: only from groups with enough trades ── */
function insights(a) {
  const out = [], base = stats(a);
  if (a.length < MIN) return [['wait', `Not enough trades yet (${a.length}/${MIN}). Below ${MIN} trades any pattern could be luck. Keep logging.`]];
  const test = (label, gs) => { const ok = gs.filter(([k, x]) => x.length >= MIN).map(([k, x]) => [k, stats(x)]).filter(x => x[1].nR); if (ok.length < 2) return;
    ok.sort((x, y) => y[1].exp - x[1].exp); const b = ok[0], w = ok[ok.length - 1]; if (b[1].exp - w[1].exp < .25) return;
    out.push([w[1].exp < 0 ? 'bad' : 'good', `<b>${label}:</b> ${E(b[0])} makes ${rr(b[1].exp)} per trade (${b[1].n} trades). ${E(w[0])} makes ${rr(w[1].exp)} (${w[1].n} trades).${w[1].exp < 0 ? ' That one is costing you money.' : ''}`]); };
  test('Session', group(a, t => sessionOf(t.t)));
  test('Setup', group(a, t => t.setup || 'No setup'));
  const ru = a.filter(t => t.rules), br = a.filter(t => !t.rules);
  if (ru.length >= MIN && br.length >= 5) { const s1 = stats(ru), s2 = stats(br); out.push(['bad', `<b>Discipline:</b> following your rules: ${rr(s1.exp)} per trade (${s1.n} trades). Breaking them: ${rr(s2.exp)} per trade over ${s2.n} trades, ${money0(s2.total)} in total.${s2.n < MIN ? ` (${s2.n}/${MIN} rule breaks: a warning, not proof.)` : ''}`]); }
  test('Mood', group(a, t => t.mood || 'No mood'));
  test('Weekday', group(a, t => WEEKDAYS[new Date(t.t).getDay()]));
  if (base.riskCv > .35) out.push(['bad', `<b>Risk:</b> your risk per trade swings a lot (average ${money0(base.meanRisk).replace('+', '')}, varies ±${Math.round(base.riskCv * 100)}%, ${base.nR} trades). Uneven risk makes every other number less reliable.`]);
  if (!out.length) out.push(['wait', `No clear pattern in ${a.length} trades. Nothing differs by more than 0.25R between groups with ${MIN}+ trades.`]);
  return out;
}

/* ── views ── */
function equityCards(s) {
  if (J.acct === 'all') { const st = J.accts.filter(x => x.start > 0); if (st.length !== J.accts.length || !st.length) return ''; }
  const acc = J.acct === 'all' ? J.accts : J.accts.filter(x => x.id === J.acct), start = acc.reduce((t, x) => t + x.start, 0); if (!(start > 0)) return '';
  let eq = start, peak = start, mddp = 0; s.sorted.forEach(t => { eq += t.pnl; if (eq > peak) peak = eq; if (peak > 0 && (peak - eq) / peak > mddp) mddp = (peak - eq) / peak; });
  return card('Equity', money(start + s.total, false), '', `started at ${money(start, false)}`) + card('Gain', pct(s.total / start), cls(s.total), tr_(s.n)) + card('Max drawdown %', pct(-mddp), 'neg', 'from the highest equity point');
}
function goalPanel(a) {
  const g = J.set.goal; if (!(g > 0)) return '';
  const now = new Date(), m0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime(), mt = acctTrades().filter(t => t.t >= m0 && t.src !== 'backtest'), p = mt.reduce((s, t) => s + t.pnl, 0), f = Math.max(0, Math.min(1, p / g));
  return panel('Monthly goal', `<div class="jn-goal"><div class="jn-gbar"><u style="width:${(f * 100).toFixed(1)}%"></u></div><div class="jn-row sp"><b class="${cls(p)}">${money(p)}</b><span class="hint">of ${money(g, false)} · ${mt.length} trades this month · ${pct(p / g)}</span></div></div>`);
}
function vOverview(a, s) {
  return `<div class="jn-cards">
    ${card('Total P&L', money(s.total), cls(s.total), tr_(s.n))}
    ${card('Win rate', pct(s.win), '', `${s.wins} of ${tr_(s.n)}`)}
    ${card('Avg win / loss', `<span class="pos">${rr(s.avgWinR)}</span> <span class="jn-dim">/</span> <span class="neg">${rr(s.avgLossR)}</span>`, '', `${tr_(s.nR)} with a stop`)}
    ${card('Profit factor', s.pf === Infinity ? '∞' : s.pf == null ? '—' : s.pf.toFixed(2), s.pf >= 1 ? 'pos' : s.pf != null ? 'neg' : '', `$ won ÷ $ lost · ${tr_(s.n)}`)}
    ${card('Expectancy', rr(s.exp), cls(s.exp || 0), `per trade · ${tr_(s.nR)} with a stop`)}
    ${card('Max drawdown', money(-s.mdd), s.mdd ? 'neg' : '', 'biggest drop from a peak')}
    ${card('Best trade', money(s.best), 'pos', '')}
    ${card('Worst trade', money(s.worst), s.worst < 0 ? 'neg' : '', '')}
    ${equityCards(s)}</div>
    ${goalPanel(a)}
    <div class="jn-grid2">${panel('Cumulative P&L', lineChart(s.curve.map(p => [p[0], p[1]]), { label: 'Cumulative P&L' }), 'every trade adds to the line')}${panel('P&L calendar', calendar(a))}</div>
    ${panel('What your trades say', `<div class="jn-ins">${insights(a).map(([c, t]) => `<div class="${c}">${t}</div>`).join('')}</div>`, `only groups with ${MIN}+ trades count`)}`;
}
function calendar(a) {
  if (!J.calMonth) { const n = new Date(); J.calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
  const y = J.calMonth.getFullYear(), m = J.calMonth.getMonth(), first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const map = new Map(group(a.filter(t => { const d = new Date(t.t); return d.getFullYear() === y && d.getMonth() === m; }), t => dkey(t.t)));
  const mt = [...map.values()].flat(), ms = stats(mt), rsum = mt.filter(hasR).reduce((x, t) => x + Rof(t), 0);
  let h = `<div class="jn-calh"><button type="button" class="btn sm" data-cal="-1" aria-label="Previous month">‹</button><b>${J.calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} <span class="${cls(ms.total)}">${J.calMode === '$' ? money0(ms.total) : rr(rsum)}</span></b>
    <span class="jn-seg"><button type="button" class="${J.calMode === '$' ? 'on' : ''}" data-calmode="$">$</button><button type="button" class="${J.calMode === 'R' ? 'on' : ''}" data-calmode="R">R</button></span><button type="button" class="btn sm" data-cal="1" aria-label="Next month">›</button></div>
    <div class="jn-cal">${['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => `<div class="h">${d}</div>`).join('')}`;
  for (let i = 0; i < first; i++) h += '<div></div>';
  const tk = todayKey();
  for (let d = 1; d <= days; d++) {
    const k = `${y}-${pad2(m + 1)}-${pad2(d)}`, ts = map.get(k);
    if (!ts) { h += `<div class="day ${k === tk ? 'today' : ''}"><span class="d">${d}</span></div>`; continue; }
    const p = ts.reduce((s, t) => s + t.pnl, 0), r = ts.filter(hasR).reduce((s, t) => s + Rof(t), 0), w = ts.filter(t => t.pnl > 0).length;
    h += `<button type="button" class="day t ${p > 0 ? 'w' : p < 0 ? 'l' : ''} ${J.selDay === k ? 'sel' : ''} ${k === tk ? 'today' : ''}" data-day="${k}" aria-label="${k}: ${ts.length} trades, ${money(p)}"><span class="d">${d}</span><span class="p">${J.calMode === '$' ? money0(p) : rr(r)}</span><span class="wr">${ts.length} · ${Math.round(w / ts.length * 100)}%</span></button>`;
  }
  h += '</div>';
  const sel = J.selDay && map.get(J.selDay);
  h += sel ? `<div class="jn-dayh"><b>${E(fmtDate(new Date(J.selDay + 'T12:00').getTime()))}</b><span class="hint">${sel.length} trade${sel.length > 1 ? 's' : ''} · ${money(sel.reduce((s, t) => s + t.pnl, 0))}</span></div>${tradeTable(sel, true)}` : '<div class="hint">Tap a day to see its trades.</div>';
  return h;
}
function tradeTable(a, compact) {
  if (!a.length) return '<div class="jn-none">No trades here yet.</div>';
  const S = J.sort, key = { t: t => t.t, sym: t => t.sym, setup: t => t.setup, r: t => Rof(t) ?? -1e9, pnl: t => t.pnl, src: t => t.src, sess: t => SESSIONS.indexOf(sessionOf(t.t)) };
  let rows = a.slice(); if (!compact) { const q = J.q.trim().toLowerCase(); if (q) rows = rows.filter(t => [t.sym, t.setup, t.note, t.mood, t.broke, t.src, sessionOf(t.t)].join(' ').toLowerCase().includes(q)); }
  const kf = key[S.k] || key.t; rows.sort((x, y) => { const a1 = kf(x), b1 = kf(y); return (a1 > b1 ? 1 : a1 < b1 ? -1 : 0) * (compact ? -1 : S.d) || (y.t - x.t); });
  const more = !compact && rows.length > 300 ? rows.length - 300 : 0; if (more) rows = rows.slice(0, 300);
  const th = (k, l) => compact ? `<th>${l}</th>` : `<th><button type="button" class="jn-sort ${S.k === k ? 'on' : ''}" data-sort="${k}">${l}${S.k === k ? (S.d > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
  return `<div class="jn-tw"><table class="jn-t"><thead><tr>${th('t', 'DATE')}${th('sym', 'SYMBOL')}${th('setup', 'SETUP')}<th>SIDE</th>${compact ? '' : th('sess', 'SESSION') + th('src', 'SOURCE')}<th>RULES</th>${th('r', 'R')}${th('pnl', 'P&L')}</tr></thead><tbody>` +
    rows.map(t => `<tr data-trade="${E(t.id)}" tabindex="0" role="button" aria-label="Open trade ${E(t.sym)} ${E(fmtTime(t.t))}"><td>${E(fmtTime(t.t))}${t.quick ? ' <span class="jn-badge">NEEDS DETAILS</span>' : ''}</td><td>${E(t.sym)}</td><td>${E(t.setup || '—')}</td><td class="${t.dir > 0 ? 'pos' : 'neg'}">${t.dir > 0 ? 'BUY' : 'SELL'}</td>${compact ? '' : `<td>${sessionOf(t.t)}</td><td><span class="jn-chip s-${t.src}">${t.src.toUpperCase()}</span></td>`}<td>${t.rules ? '✓' : `<span class="neg">✗ ${E(t.broke)}</span>`}</td><td class="${cls(Rof(t) || 0)}">${hasR(t) ? rr(Rof(t)) : '<span class="jn-dim">no stop</span>'}</td><td class="${cls(t.pnl)}">${money(t.pnl)}</td></tr>`).join('') +
    `</tbody></table></div>${more ? `<div class="hint">${more} more trades: narrow the filters or search.</div>` : ''}`;
}
function grade(s) { if (s.n < MIN) return ['—', '', `not enough trades yet (${s.n}/${MIN})`]; if (!s.nR) return ['—', '', 'no stops logged']; return s.exp >= .5 ? ['A', 'g-A', 'keep doing it'] : s.exp >= .2 ? ['B', 'g-B', 'solid'] : s.exp >= 0 ? ['C', 'g-C', 'barely positive'] : ['D', 'g-D', 'losing money']; }
J.grade = grade;
function vSetups(a) {
  const rows = group(a, t => t.setup || 'No setup').map(([k, x]) => [k, stats(x)]).sort((p, q) => (q[1].exp ?? -99) - (p[1].exp ?? -99));
  return panel('Playbook report card', rows.length ? `<div class="jn-tw"><table class="jn-t"><thead><tr><th>SETUP</th><th>GRADE</th><th>TRADES</th><th>WIN %</th><th>AVG WIN</th><th>AVG LOSS</th><th>PROFIT F.</th><th>EXPECTANCY</th><th>P&L</th></tr></thead><tbody>${rows.map(([k, s]) => { const g = grade(s); return `<tr><td>${E(k)}</td><td><span class="jn-grade ${g[1]}">${g[0]}</span> <span class="hint">${g[2]}</span></td><td>${s.n}</td><td>${pct(s.win)}</td><td class="pos">${rr(s.avgWinR)}</td><td class="neg">${rr(s.avgLossR)}</td><td>${s.pf === Infinity ? '∞' : s.pf == null ? '—' : s.pf.toFixed(2)}</td><td class="${cls(s.exp || 0)}">${rr(s.exp)}</td><td class="${cls(s.total)}">${money0(s.total)}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="jn-none">No trades yet.</div>', `grade = expectancy per trade, only after ${MIN} trades`)
    + panel('Expectancy by setup', bars(group(a, t => t.setup || 'No setup'), { order: 1 }));
}
function vTime(a) {
  const hours = group(a.slice().sort((x, y) => new Date(x.t).getHours() - new Date(y.t).getHours()), t => pad2(new Date(t.t).getHours()) + ':00');
  return panel('By session', bars(SESSIONS.map(k => [k, a.filter(t => sessionOf(t.t) === k)])), 'Asia 00–07 · London 07–13 · New York 13–21 (UTC)')
    + panel('By weekday', bars([1, 2, 3, 4, 5, 6, 0].map(i => [WEEKDAYS[i], a.filter(t => new Date(t.t).getDay() === i)])))
    + panel('By hour you entered', bars(hours), 'your local time');
}
function vDisc(a) {
  const ru = stats(a.filter(t => t.rules)), br = stats(a.filter(t => !t.rules));
  const cost = group(a.filter(t => !t.rules), t => t.broke || 'Other').map(([k, x]) => [k, stats(x)]).sort((p, q) => p[1].total - q[1].total);
  return `<div class="jn-cards">${card('Followed rules', rr(ru.exp), cls(ru.exp || 0), `${tr_(ru.n)} · ${money0(ru.total)}`)}${card('Broke rules', rr(br.exp), cls(br.exp || 0), `${tr_(br.n)} · ${money0(br.total)}`)}${card('Rule-break rate', a.length ? pct(br.n / a.length) : '—', '', `${br.n} of ${tr_(a.length)}`)}${card('Cost of breaking', money(br.total), cls(br.total), 'total P&L of rule breaks')}</div>`
    + panel('Cost per broken rule', cost.length ? `<div class="jn-tw"><table class="jn-t"><thead><tr><th>RULE</th><th>TIMES</th><th>P&L</th><th>EXPECTANCY</th></tr></thead><tbody>${cost.map(([k, s]) => `<tr><td>${E(k)}</td><td>${s.n}</td><td class="${cls(s.total)}">${money(s.total)}</td><td class="${cls(s.exp || 0)}">${rr(s.exp)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="jn-none">No broken rules in these trades.</div>')
    + panel('Mood before the trade', bars(group(a, t => t.mood || 'No mood'), { order: 1 }));
}
function rHistogram(s) {
  if (s.rs.length < 3) return '<div class="jn-none">Needs 3 or more trades with a stop.</div>';
  const lo = Math.max(-4, Math.floor(Math.min(...s.rs) * 2) / 2), hi = Math.min(6, Math.ceil(Math.max(...s.rs) * 2) / 2), bins = [];
  for (let b = lo; b < hi; b += .5) bins.push([b, 0]); if (!bins.length) bins.push([lo, 0]);
  s.rs.forEach(r => { const i = Math.max(0, Math.min(bins.length - 1, Math.floor((Math.max(lo, Math.min(hi - 1e-9, r)) - lo) / .5))); bins[i][1]++; });
  const mx = Math.max(...bins.map(b => b[1])), W = 640, H = 170, bw = (W - 40) / bins.length;
  return `<svg class="jn-chart hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="R distribution, ${s.rs.length} trades">${bins.map((b, i) => { const h = b[1] / mx * (H - 40); return `<rect class="${b[0] >= 0 ? 'p' : 'n'}" x="${(20 + i * bw + 1).toFixed(1)}" y="${(H - 22 - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}"><title>${b[0].toFixed(1)}R to ${(b[0] + .5).toFixed(1)}R: ${b[1]} trades</title></rect>${b[1] ? `<text class="tx" x="${(20 + i * bw + bw / 2).toFixed(1)}" y="${(H - 26 - h).toFixed(1)}" text-anchor="middle">${b[1]}</text>` : ''}`; }).join('')}
    ${bins.filter((b, i) => i % Math.max(1, Math.round(bins.length / 8)) === 0).map((b, j, arr) => `<text class="tx" x="${(20 + bins.indexOf(b) * bw).toFixed(1)}" y="${H - 6}">${b[0] > 0 ? '+' : ''}${b[0]}R</text>`).join('')}</svg>`;
}
function streakStrip(s) {
  const last = s.sorted.slice(-120); if (!last.length) return '<div class="jn-none">No trades yet.</div>';
  return `<div class="jn-strip" role="img" aria-label="Last ${last.length} trades, oldest first">${last.map(t => `<i class="${t.pnl > 0 ? 'w' : t.pnl < 0 ? 'l' : 'b'}" title="${E(fmtTime(t.t))} ${E(money(t.pnl))}"></i>`).join('')}</div><div class="hint">Last ${tr_(last.length)}, oldest on the left. Longest winning run ${s.maxW}, longest losing run ${s.maxStreak}.</div>`;
}
function vRisk(a, s) {
  const dd = s.curve.length ? s.curve[s.curve.length - 1][2] : 0;
  return `<div class="jn-cards">${card('Max drawdown', money(-s.mdd), s.mdd ? 'neg' : '', 'biggest drop from a peak')}${card('Drawdown now', money(dd), dd < 0 ? 'neg' : '', 'below your best point')}${card('Longest losing streak', s.maxStreak, '', `now: ${s.curStreak} · ${tr_(s.n)}`)}${card('Risk per trade', s.meanRisk ? money0(s.meanRisk).replace('+', '') : '—', '', s.meanRisk ? `varies ±${Math.round(s.riskCv * 100)}%${s.riskCv > .35 ? ' · too uneven' : ' · consistent'} · ${tr_(s.nR)}` : 'no stops logged')}</div>`
    + panel('Drawdown', lineChart(s.curve.map(p => [p[0], p[2]]), { h: 180, neg: true, label: 'Drawdown' }), '0 = at your best point')
    + `<div class="jn-grid2">${panel('R distribution', rHistogram(s), `${tr_(s.rs.length)} with a stop`)}${panel('Win / loss streaks', streakStrip(s))}</div>`
    + panel('Survive a bad streak?', s.meanRisk ? `<p class="jn-p">At your average risk of <b>${money0(s.meanRisk).replace('+', '')}</b>, 10 losses in a row (it happens to every trader) would cost about <b class="neg">${money0(-10 * s.meanRisk)}</b>. Your longest losing streak so far: <b>${s.maxStreak}</b>.</p>` : '<div class="jn-none">Log trades with a stop to see this.</div>');
}
function vTrades(a) {
  return panel('All trades', `<div class="jn-row"><input type="search" class="jn-search" data-q placeholder="Search symbol, setup, note, mood…" value="${E(J.q)}" aria-label="Search trades"><button type="button" class="btn sm" data-jn="export">EXPORT CSV</button></div>${tradeTable(a, false)}`, 'tap a row to open it');
}
function vCompare(a) {
  const base = acctTrades().filter(t => { const [f, to] = rangeBounds(); return t.t >= f && t.t <= to && (J.f.sym === 'all' || t.sym === J.f.sym); });
  const setups = [...new Set(base.map(t => t.setup || 'No setup'))];
  const rows = setups.map(k => { const x = base.filter(t => (t.setup || 'No setup') === k); return [k, stats(x.filter(t => t.src === 'backtest')), stats(x.filter(t => t.src !== 'backtest'))]; }).filter(r => r[1].n || r[2].n);
  const cell = s => s.n ? `<td>${s.n}</td><td>${pct(s.win)}</td><td class="${cls(s.exp || 0)}">${rr(s.exp)}</td>` : '<td>0</td><td>—</td><td>—</td>';
  const gap = (b, l) => b.nR && l.nR ? `<td class="${cls(l.exp - b.exp)}">${rr(l.exp - b.exp)}${b.n < MIN || l.n < MIN ? ' <span class="hint">few trades</span>' : ''}</td>` : '<td>—</td>';
  return panel('Backtest vs live, by setup', rows.length ? `<div class="jn-tw"><table class="jn-t cmp"><thead><tr><th rowspan="2">SETUP</th><th colspan="3">BACKTEST</th><th colspan="3">LIVE (MANUAL + BOT)</th><th rowspan="2">LIVE − BACKTEST</th></tr><tr><th>TRADES</th><th>WIN %</th><th>EXPECTANCY</th><th>TRADES</th><th>WIN %</th><th>EXPECTANCY</th></tr></thead><tbody>${rows.map(([k, b, l]) => `<tr><td>${E(k)}</td>${cell(b)}${cell(l)}${gap(b, l)}</tr>`).join('')}</tbody></table></div>
    <p class="hint">If live expectancy is much lower than backtest, the edge may not survive real fills, spread and you. Uses the date and symbol filters, not the source filter.</p>` : '<div class="jn-none">Log trades with the source BACKTEST to compare them with your live trades.</div>', 'the most important check for a bot');
}
function weekBounds(off) { const t0 = dayStart(Date.now()), wd = (new Date(t0).getDay() + 6) % 7, s = t0 - wd * 864e5 + off * 7 * 864e5; return [s, s + 7 * 864e5 - 1]; }
const weekKey = s => dkey(s);
function vReviews() {
  const [s0] = weekBounds(0), cur = J.reviews.find(r => r.week === weekKey(s0));
  return panel('This week', `<p class="jn-p">${cur ? 'You already reviewed this week. You can review it again.' : 'Two minutes, once a week (Sunday is best): look at the numbers, then write one line for next week.'}</p><button type="button" class="btn pri" data-jn="review">START THE WEEKLY REVIEW</button>`)
    + panel('Saved reviews', J.reviews.length ? `<div class="jn-revs">${J.reviews.slice().sort((a, b) => b.at - a.at).map(r => `<div class="jn-rev"><div class="jn-row sp"><b>Week of ${E(fmtDate(new Date(r.week + 'T12:00').getTime()))}</b><span class="${cls(r.stats.total || 0)}">${money(r.stats.total || 0)} · ${r.stats.n || 0} trades</span></div><p>${E(r.text) || '<span class="jn-dim">(no line written)</span>'}</p></div>`).join('')}</div>` : '<div class="jn-none">No reviews yet.</div>');
}
function vHow() {
  return panel('Every number, in plain words', `<dl class="jn-how">
    <dt>R</dt><dd>P&amp;L ÷ $ risked. Risk $100 and win $200 = +2R. Trades without a stop have no R and are left out of every R number (not counted as 0R).</dd>
    <dt>$ risked</dt><dd>|entry − stop| × lot × contract size, unless you type it. Gold (XAUUSD) is 100 per lot; set others in JOURNAL SETTINGS.</dd>
    <dt>P&amp;L</dt><dd>(exit − entry) × side × lot × contract size − fees, unless you type it. Side is +1 for BUY, −1 for SELL. Fees = commission + swap.</dd>
    <dt>Win rate</dt><dd>trades with P&amp;L above 0 ÷ all trades. Breakeven trades count as trades but not as wins.</dd>
    <dt>Average win / loss</dt><dd>the average R of winning trades / of losing trades, only trades with a stop.</dd>
    <dt>Profit factor</dt><dd>total $ won ÷ total $ lost. Above 1 makes money.</dd>
    <dt>Expectancy</dt><dd>the average R per trade over trades with a stop. What one more trade is worth.</dd>
    <dt>Max drawdown</dt><dd>the biggest fall of cumulative P&amp;L from its highest point (starting at 0) to a later low. With a starting balance it is also shown as % of the equity peak.</dd>
    <dt>Losing streak</dt><dd>the most losing trades in a row. A breakeven trade does not end a streak.</dd>
    <dt>Session</dt><dd>from the trade's open time in UTC: Asia 00–07, London 07–13, New York 13–21, after hours otherwise.</dd>
    <dt>Grades and insights</dt><dd>only for groups with ${MIN} or more trades. A = 0.5R or more per trade, B = 0.2R or more, C = above 0, D = losing.</dd>
    <dt>Daily loss limit</dt><dd>today's closed P&amp;L (backtests not counted) at or below −limit, or the daily trade count reached: the journal tells you to stop, and any further trade that day counts as a rule break.</dd>
    <dt>Money</dt><dd>kept exact, rounded to cents only when shown. R is shown to 2 decimals.</dd></dl>`);
}

/* ══════════════════════════════════════════════════════
   SHEETS: log/edit a trade, quick log, trade detail, import, settings, weekly review
   ══════════════════════════════════════════════════════ */
function sheet(html, cls2) { const s = $('jn-sheet'); $('jn-sheet-in').innerHTML = html; $('jn-sheet-in').className = 'jn-sheet-in ' + (cls2 || ''); s.hidden = false; const f = s.querySelector('[autofocus], input, select, button'); if (f && !isPhone()) setTimeout(() => f.focus({ preventScroll: true }), 30); }
function closeSheet() { const s = document.getElementById('jn-sheet'); if (s) { s.hidden = true; $('jn-sheet-in').innerHTML = ''; } J.detail = null; J.form = null; }
const optList = (list, cur, blank) => (blank ? `<option value="">${E(blank)}</option>` : '') + list.map(x => `<option value="${E(x)}" ${x === cur ? 'selected' : ''}>${E(x)}</option>`).join('');
const localInput = t => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

function formHTML(t) {
  const S = J.set, n = v => v == null ? '' : v, sym = t ? t.sym : S.lastSym, L = todayInfo(), newToday = !t || dkey(t.t) === todayKey();
  const accts = J.accts.length > 1 ? `<label>ACCOUNT<select name="acct">${J.accts.map(a => `<option value="${E(a.id)}" ${(t ? t.acct : (J.acct !== 'all' ? J.acct : J.accts[0].id)) === a.id ? 'selected' : ''}>${E(a.name)}</option>`).join('')}</select></label>` : '';
  return `<div class="jn-sh"><b>${t ? 'EDIT TRADE' : 'LOG A TRADE'}</b><button type="button" class="jn-x" data-jn="close" aria-label="Close">✕</button></div>
  <form class="jn-form" id="jn-form" novalidate autocomplete="off">
    ${!t && L.hit ? `<label class="jn-ack"><input type="checkbox" name="limitAck"><span><b>I know I hit my daily limit today.</b> This trade will be marked as a rule break.</span></label>` : ''}
    <div class="jn-fg">
      <label>DATE AND TIME<input type="datetime-local" name="t" value="${t ? localInput(t.t) : localInput(Date.now())}" required></label>
      <label>SYMBOL<input name="sym" list="jn-syms" value="${E(sym)}" maxlength="20" autocapitalize="characters"></label>
      ${accts}
      <div class="jn-side" role="radiogroup" aria-label="Side"><button type="button" class="${!t || t.dir > 0 ? 'on buy' : ''}" data-side="1" role="radio" aria-checked="${!t || t.dir > 0}">BUY</button><button type="button" class="${t && t.dir < 0 ? 'on sell' : ''}" data-side="-1" role="radio" aria-checked="${!!(t && t.dir < 0)}">SELL</button></div>
      <label>ENTRY<input name="entry" inputmode="decimal" value="${n(t && t.entry)}"></label>
      <label>STOP<input name="sl" inputmode="decimal" value="${n(t && t.sl)}"></label>
      <label>TAKE PROFIT<input name="tp" inputmode="decimal" value="${n(t && t.tp)}"></label>
      <label>EXIT<input name="exit" inputmode="decimal" value="${n(t && t.exit)}"></label>
      <label>LOT<input name="lot" inputmode="decimal" value="${n(t && t.lot)}"></label>
      <label>CONTRACT SIZE<input name="cs" inputmode="decimal" value="${n(t && t.cs)}" placeholder="${csFor(sym)}"></label>
      <label>P&amp;L $<input name="pnl" inputmode="decimal" value="${t && t.pnlTyped ? n(t.pnl) : ''}" placeholder="auto"></label>
      <label>RISKED $<input name="risk" inputmode="decimal" value="${t && t.riskTyped ? n(t.risk) : ''}" placeholder="auto"></label>
      <label>FEES $ (COMMISSION + SWAP)<input name="fees" inputmode="decimal" value="${t && t.fees ? t.fees : ''}" placeholder="0"></label>
      <label class="jn-chk"><input type="checkbox" name="nostop" ${t && t.nostop ? 'checked' : ''}><span>No stop (risk unknown)</span></label>
      <label>SETUP<select name="setup">${optList(S.setups, t ? t.setup : '', 'No setup')}</select></label>
      <label>SOURCE<select name="src">${['manual', 'bot', 'backtest'].map(x => `<option value="${x}" ${(t ? t.src : 'manual') === x ? 'selected' : ''}>${x.toUpperCase()}</option>`).join('')}</select></label>
      <label>MOOD BEFORE<select name="mood">${optList(S.moods, t ? t.mood : '', 'No mood')}</select></label>
      <div class="jn-rules"><span>FOLLOWED MY RULES?</span><div class="jn-seg"><button type="button" class="${!t || t.rules ? 'on' : ''}" data-rules="1">YES</button><button type="button" class="${t && !t.rules ? 'on' : ''}" data-rules="0">NO</button></div></div>
      <label class="jn-broke" ${!t || t.rules ? 'hidden' : ''}>WHICH RULE?<select name="broke">${optList(S.rules, t ? t.broke : '', 'Pick one')}</select></label>
      <label class="jn-wide">NOTES<textarea name="note" rows="3" maxlength="4000">${E(t ? t.note : '')}</textarea></label>
      <div class="jn-wide jn-shots"><span>SCREENSHOTS (UP TO 3)</span><div class="jn-shotl" id="jn-shotl"></div><label class="btn sm jn-up">+ ADD<input type="file" accept="image/*" multiple hidden data-shot></label><small class="hint">Saved small (about 1600 px). Used: <b id="jn-used">${(J.shotsBytes / 1048576).toFixed(1)} MB</b></small></div>
    </div>
    <datalist id="jn-syms">${S.syms.map(x => `<option value="${E(x.s)}">`).join('')}</datalist>
    <div class="jn-prev" id="jn-prev" aria-live="polite"></div>
    <div class="jn-err" id="jn-err" role="alert" hidden></div>
    <div class="jn-row sp"><span>${t ? '<button type="button" class="btn danger" data-jn="delete">DELETE</button>' : ''}</span><span class="jn-row"><button type="button" class="btn" data-jn="close">CANCEL</button><button type="submit" class="btn pri">${t ? 'SAVE CHANGES' : 'SAVE TRADE'}</button></span></div>
  </form>`;
}
function readForm() {
  const f = $('jn-form'), g = n => f.elements[n] ? f.elements[n].value : '', F = J.form;
  const t = g('t') ? new Date(g('t')).getTime() : NaN;
  return { t, sym: cleanStr(g('sym') || 'XAUUSD', 20).toUpperCase(), dir: F.dir, entry: num(g('entry')), sl: num(g('sl')), tp: num(g('tp')), exit: num(g('exit')), lot: num(g('lot')), cs: num(g('cs')),
    pnl: num(g('pnl')), risk: num(g('risk')), fees: num(g('fees')) || 0, nostop: f.elements.nostop.checked, setup: g('setup'), src: g('src'), mood: g('mood'), rules: F.rules, broke: F.rules ? '' : g('broke'),
    note: f.elements.note.value.slice(0, 4000), acct: f.elements.acct ? g('acct') : (J.form.trade ? J.form.trade.acct : (J.acct !== 'all' ? J.acct : J.accts[0].id)), limitAck: f.elements.limitAck ? f.elements.limitAck.checked : false };
}
function validate(i, c) {
  const e = [];
  if (!isFinite(i.t)) e.push('Add the date and time.');
  if (c.pnl == null) e.push('Add the P&L $, or entry, exit and lot so it can be worked out.');
  if (!i.nostop && !(c.risk > 0)) e.push('Add the stop (or the $ risked), or tick "No stop".');
  if (i.sl != null && i.entry != null && !i.nostop) { if (i.dir > 0 && i.sl >= i.entry) e.push('For a BUY the stop must be below the entry.'); if (i.dir < 0 && i.sl <= i.entry) e.push('For a SELL the stop must be above the entry.'); }
  if (!i.rules && !i.broke) e.push('Pick which rule you broke.');
  if (J.form && J.form.needAck && !i.limitAck) e.push('Tick "I know I hit my daily limit" to log another trade today.');
  return e;
}
function preview() {
  if (!$('jn-form')) return; const i = readForm(), c = calc(i), p = $('jn-prev');
  const sess = isFinite(i.t) ? sessionOf(i.t) : '—';
  p.innerHTML = `<span>RISK <b>${c.risk != null ? money(c.risk, false) : i.nostop ? 'no stop' : '—'}</b>${!i.risk && c.autoRisk != null ? '<i>auto</i>' : ''}</span><span>P&amp;L <b class="${cls(c.pnl || 0)}">${c.pnl != null ? money(c.pnl) : '—'}</b>${i.pnl == null && c.autoPnl != null ? '<i>auto</i>' : ''}</span><span>R <b class="${cls(c.R || 0)}">${c.R != null ? rr(c.R) : '—'}</b></span><span>SESSION <b>${sess}</b></span>`;
}
function openForm(t) {
  const L = todayInfo();
  J.form = { trade: t || null, dir: t ? t.dir : 1, rules: t ? t.rules : true, shots: t ? t.shots.slice() : [], add: [], needAck: !t && L.hit };
  sheet(formHTML(t), 'wide'); preview(); shotList();
}
async function saveForm() {
  const i = readForm(), c = calc(i), errs = validate(i, c), box = $('jn-err');
  if (errs.length) { box.hidden = false; box.innerHTML = errs.map(x => `<div>${E(x)}</div>`).join(''); sfx('deny'); return; }
  box.hidden = true; const F = J.form, prev = F.trade, now = Date.now();
  const shotIds = F.shots.slice(); for (const a of F.add) { if (shotIds.length >= 3) break; shotIds.push(a.id); }
  if (F.add.length) await tx(['shots'], 'readwrite', t => { const s = t.objectStore('shots'); F.add.forEach(a => s.put(a)); }).catch(() => warn(true));
  const removed = prev ? prev.shots.filter(x => !shotIds.includes(x)) : []; if (removed.length) tx(['shots'], 'readwrite', t => { const s = t.objectStore('shots'); removed.forEach(id => s.delete(id)); }).catch(() => {});
  J.shotsBytes += F.add.reduce((s, a) => s + a.size, 0);
  const trade = cleanTrade({ id: prev ? prev.id : jid('t'), acct: i.acct, t: i.t, sym: i.sym, dir: i.dir, entry: i.entry, sl: i.sl, tp: i.tp, exit: i.exit, lot: i.lot, cs: i.cs, fees: i.fees,
    pnl: c.pnl, risk: c.risk, pnlTyped: i.pnl != null, riskTyped: i.risk != null, nostop: i.nostop, setup: i.setup, src: i.src, mood: i.mood,
    rules: F.needAck ? false : i.rules, broke: F.needAck ? (i.broke || 'Daily loss limit') : i.broke, note: i.note, shots: shotIds,
    quick: prev ? (prev.quick && !(i.entry != null && (i.sl != null || i.nostop) && i.exit != null)) : false, pos: prev ? prev.pos : '', created: prev ? prev.created : now, updated: now, limitAck: F.needAck || (prev && prev.limitAck) });
  J.set.lastSym = i.sym; saveSettings();
  await applyOps([{ prev, next: trade }], true);
  sfx('claim'); showToast(prev ? 'TRADE SAVED' : (F.needAck ? 'TRADE SAVED · COUNTED AS A RULE BREAK' : 'TRADE SAVED')); closeSheet(); render();
}
/* screenshots: shrink to about 1600 px, WebP, kept in IndexedDB as blobs, loaded only when shown */
function shrink(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => b ? res({ id: jid('s'), blob: b, w: c.width, h: c.height, size: b.size, type: b.type }) : rej(new Error('encode')), 'image/webp', .82); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); }; img.src = url;
  });
}
const shotURLs = new Map();
function shotURL(id) {
  if (shotURLs.has(id)) return Promise.resolve(shotURLs.get(id));
  return tx(['shots'], 'readonly', t => t.objectStore('shots').get(id)).then(s => { if (!s || !s.blob) return null; const u = URL.createObjectURL(s.blob); shotURLs.set(id, u); return u; }).catch(() => null);
}
function shotList() {
  const box = document.getElementById('jn-shotl'); if (!box || !J.form) return; box.textContent = '';
  const all = J.form.shots.map(id => ({ id, saved: true })).concat(J.form.add.map(a => ({ id: a.id, a })));
  all.forEach(s => { const w = el('div', { class: 'jn-shot' }), im = el('img', { alt: 'Screenshot' }); w.appendChild(im);
    const x = el('button', { type: 'button', class: 'jn-shx', 'data-shdel': s.id, 'aria-label': 'Remove screenshot' }, '✕'); w.appendChild(x); box.appendChild(w);
    if (s.a) { const u = URL.createObjectURL(s.a.blob); im.src = u; } else shotURL(s.id).then(u => { if (u) im.src = u; }); });
  const up = document.querySelector('#jn-form .jn-up'); if (up) up.hidden = all.length >= 3;
}

function quickHTML() {
  const S = J.set, L = todayInfo();
  return `<div class="jn-sh"><b>QUICK LOG</b><button type="button" class="jn-x" data-jn="close" aria-label="Close">✕</button></div>
  <p class="jn-p">Just closed a trade? Three things now, the rest later.</p>
  <form class="jn-form" id="jn-qform" novalidate>
    ${L.hit ? `<label class="jn-ack"><input type="checkbox" name="limitAck"><span><b>I know I hit my daily limit today.</b> This trade will be marked as a rule break.</span></label>` : ''}
    <div class="jn-fg q">
      <label class="jn-wide">RESULT $<input name="pnl" inputmode="decimal" placeholder="e.g. -120 or 240" autofocus></label>
      <label>SETUP<select name="setup">${optList(S.setups, '', 'No setup')}</select></label>
      <div class="jn-rules"><span>FOLLOWED MY RULES?</span><div class="jn-seg"><button type="button" class="on" data-qrules="1">YES</button><button type="button" data-qrules="0">NO</button></div></div>
      <label class="jn-qbroke" hidden>WHICH RULE?<select name="broke">${optList(S.rules, '', 'Pick one')}</select></label>
    </div>
    <div class="jn-err" id="jn-err" role="alert" hidden></div>
    <div class="jn-row sp"><span></span><span class="jn-row"><button type="button" class="btn" data-jn="close">CANCEL</button><button type="submit" class="btn pri">SAVE</button></span></div>
  </form>`;
}
async function saveQuick() {
  const f = $('jn-qform'), pnl = num(f.elements.pnl.value), rules = J.qrules !== false, broke = f.elements.broke.value, L = todayInfo(), ack = f.elements.limitAck ? f.elements.limitAck.checked : true, box = $('jn-err');
  const e = []; if (pnl == null) e.push('Type the result in $ (a minus sign for a loss).'); if (!rules && !broke) e.push('Pick which rule you broke.'); if (L.hit && !ack) e.push('Tick "I know I hit my daily limit" to log another trade today.');
  if (e.length) { box.hidden = false; box.innerHTML = e.map(x => `<div>${E(x)}</div>`).join(''); sfx('deny'); return; }
  const now = Date.now(), t = cleanTrade({ id: jid('t'), acct: J.acct !== 'all' ? J.acct : J.accts[0].id, t: now, sym: J.set.lastSym, dir: 1, pnl, pnlTyped: true, risk: null, nostop: false, setup: f.elements.setup.value, src: 'manual',
    rules: L.hit ? false : rules, broke: L.hit ? (broke || 'Daily loss limit') : (rules ? '' : broke), quick: true, created: now, updated: now, limitAck: L.hit });
  await applyOps([{ prev: null, next: t }], true); sfx('claim'); showToast('SAVED · ADD THE DETAILS LATER'); closeSheet(); render();
}

function detailHTML(t) {
  const list = filtered().a.slice().sort((a, b) => a.t - b.t), i = list.findIndex(x => x.id === t.id), c = calc(t);
  const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`, n = v => v == null ? '—' : E(String(v));
  return `<div class="jn-sh"><b>${E(t.sym)} · <span class="${t.dir > 0 ? 'pos' : 'neg'}">${t.dir > 0 ? 'BUY' : 'SELL'}</span>${t.quick ? ' <span class="jn-badge">NEEDS DETAILS</span>' : ''}</b>
    <span class="jn-row"><button type="button" class="btn sm" data-nav="-1" ${i <= 0 ? 'disabled' : ''} aria-label="Previous trade">‹</button><button type="button" class="btn sm" data-nav="1" ${i < 0 || i >= list.length - 1 ? 'disabled' : ''} aria-label="Next trade">›</button><button type="button" class="jn-x" data-jn="close" aria-label="Close">✕</button></span></div>
    <div class="jn-dhero"><div><span class="hint">${E(fmtDate(t.t))} · ${E(new Date(t.t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }))} · ${sessionOf(t.t)}</span><b class="${cls(t.pnl)}">${money(t.pnl)}</b></div><b class="jn-dr ${cls(c.R || 0)}">${hasR(t) ? rr(Rof(t)) : 'no stop'}</b></div>
    <div class="jn-dshots" id="jn-dshots">${t.shots.map(id => `<figure data-shot="${E(id)}"><img alt="Screenshot of the trade"></figure>`).join('')}</div>
    <dl class="jn-dl">${row('ENTRY', n(t.entry))}${row('STOP', t.nostop ? 'no stop' : n(t.sl))}${row('TAKE PROFIT', n(t.tp))}${row('EXIT', n(t.exit))}${row('LOT', n(t.lot))}${row('CONTRACT SIZE', n(t.cs != null ? t.cs : csFor(t.sym)))}${row('RISKED', t.risk != null ? money(t.risk, false) : '—')}${row('FEES', t.fees ? money(-t.fees) : '—')}${row('SETUP', E(t.setup || '—'))}${row('SOURCE', t.src.toUpperCase())}${row('MOOD', E(t.mood || '—'))}${row('RULES', t.rules ? '✓ followed' : `<span class="neg">✗ ${E(t.broke)}</span>`)}${row('ACCOUNT', E((J.accts.find(a => a.id === t.acct) || {}).name || t.acct))}${t.pos ? row('MT5 POSITION', E(t.pos)) : ''}</dl>
    ${t.note ? `<div class="jn-note"></div>` : ''}
    <div class="jn-row sp"><button type="button" class="btn danger" data-jn="delete">DELETE</button><button type="button" class="btn pri" data-jn="edit">EDIT</button></div>`;
}
function openDetail(id) {
  const t = J.trades.find(x => x.id === id); if (!t) return; J.detail = id; sheet(detailHTML(t), 'wide');
  const n = document.querySelector('#jn-sheet .jn-note'); if (n) n.textContent = t.note;
  document.querySelectorAll('#jn-dshots figure').forEach(f => shotURL(f.dataset.shot).then(u => { const im = f.querySelector('img'); if (u) im.src = u; else f.remove(); }));
}
function askDelete(id) {
  const t = J.trades.find(x => x.id === id); if (!t) return;
  confirmBox(`Delete this trade?<br><br>${E(t.sym)} · ${E(fmtTime(t.t))} · ${E(money(t.pnl))}<br>You can bring it back with UNDO.`, 'DELETE', () => { applyOps([{ prev: t, next: null }], true).then(() => { showToast('TRADE DELETED · UNDO TO BRING IT BACK'); closeSheet(); render(); }); });
}

/* ── settings ── */
function listEditor(key, title, hint, extra) {
  const L = J.set[key];
  return `<section class="jn-sec"><h4>${title}</h4>${hint ? `<p class="hint">${hint}</p>` : ''}<div class="jn-list">${L.map((x, i) => `<div class="jn-li"><input value="${E(key === 'syms' ? x.s : x)}" data-list="${key}" data-i="${i}" data-k="${key === 'syms' ? 's' : ''}" maxlength="${key === 'syms' ? 20 : 80}" aria-label="${title} ${i + 1}">${key === 'syms' ? `<input class="jn-cs" value="${E(x.cs)}" inputmode="decimal" data-list="syms" data-i="${i}" data-k="cs" aria-label="Contract size of ${E(x.s)}">` : ''}<button type="button" class="jn-x" data-ldel="${key}" data-i="${i}" aria-label="Remove ${E(key === 'syms' ? x.s : x)}">✕</button></div>`).join('')}</div>
    <div class="jn-row"><input data-lnew="${key}" placeholder="Add…" maxlength="80" aria-label="Add to ${title}"><button type="button" class="btn sm" data-ladd="${key}">ADD</button></div>${extra || ''}</section>`;
}
function settingsHTML() {
  const S = J.set, ms = [];
  try { Object.values(G.areas).forEach(a => (G.missions[a.id] || []).forEach(m => ms.push([a.id + '|' + m.id, a.name + ' · ' + m.title]))); } catch (e) {}
  return `<div class="jn-sh"><b>JOURNAL SETTINGS</b><button type="button" class="jn-x" data-jn="close" aria-label="Close">✕</button></div>
    <section class="jn-sec"><h4>DAILY LIMITS</h4><div class="jn-fg"><label>DAILY LOSS LIMIT $ (0 = OFF)<input data-set="limit" inputmode="decimal" value="${S.limit || ''}" placeholder="0"></label><label>MAX TRADES A DAY (0 = OFF)<input data-set="maxTrades" inputmode="numeric" value="${S.maxTrades || ''}" placeholder="0"></label><label>MONTHLY GOAL $ (0 = OFF)<input data-set="goal" inputmode="decimal" value="${S.goal || ''}" placeholder="0"></label></div></section>
    <section class="jn-sec"><h4>ACCOUNTS</h4><p class="hint">A starting balance turns on equity, % gain and % drawdown.</p><div class="jn-list">${J.accts.map((a, i) => `<div class="jn-li acct"><input value="${E(a.name)}" data-acct="${i}" data-k="name" maxlength="40" aria-label="Account name"><select data-acct="${i}" data-k="kind" aria-label="Kind">${['real', 'demo', 'prop', 'backtest'].map(k => `<option ${a.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select><input class="jn-cs" value="${a.start || ''}" placeholder="start $" inputmode="decimal" data-acct="${i}" data-k="start" aria-label="Starting balance">${J.accts.length > 1 ? `<button type="button" class="jn-x" data-adel="${i}" aria-label="Remove account ${E(a.name)}">✕</button>` : ''}</div>`).join('')}</div><button type="button" class="btn sm" data-jn="acct-add">+ ADD ACCOUNT</button></section>
    ${listEditor('setups', 'SETUPS (PLAYBOOK)', 'Renaming a setup renames it on every past trade. Removing one asks where its trades go.')}
    ${listEditor('rules', 'RULES YOU CAN BREAK')}
    ${listEditor('moods', 'MOODS')}
    ${listEditor('syms', 'SYMBOLS AND CONTRACT SIZE', 'Contract size per lot: gold 100, most FX pairs 100,000.')}
    <section class="jn-sec"><h4>WEEKLY REVIEW MISSION</h4><p class="hint">Finishing the weekly review can complete one of your missions (only if it is due that day). The journal never creates missions.</p><label><select data-set="reviewMission"><option value="">None</option>${ms.map(([v, l]) => `<option value="${E(v)}" ${S.reviewMission === v ? 'selected' : ''}>${E(l)}</option>`).join('')}</select></label></section>
    <section class="jn-sec"><h4>DATA</h4><p class="hint">${J.trades.length} trades · screenshots use ${(J.shotsBytes / 1048576).toFixed(1)} MB. The journal is kept apart from your game save and goes into your normal backup file.</p><div class="jn-row"><button type="button" class="btn sm" data-jn="export">EXPORT CSV</button><button type="button" class="btn sm danger" data-jn="wipe">DELETE ALL JOURNAL DATA</button></div></section>`;
}
function setListValue(key, i, k, v) {
  const S = J.set;
  if (key === 'syms') { const s = S.syms[i]; if (!s) return; if (k === 'cs') { const n2 = num(v); if (n2 > 0) s.cs = n2; } else { v = cleanStr(v, 20).toUpperCase(); if (v) s.s = v; } saveSettings(); return; }
  v = cleanStr(v, key === 'rules' ? 80 : 60); const old = S[key][i]; if (!v || old === v) return;
  if (S[key].includes(v)) { showToast('ALREADY IN THE LIST'); return; }
  S[key][i] = v;
  const f = { setups: 'setup', rules: 'broke', moods: 'mood' }[key], ops = J.trades.filter(t => t[f] === old).map(t => ({ prev: t, next: Object.assign({}, t, { [f]: v, updated: Date.now() }) }));
  if (ops.length) { applyOps(ops, true); showToast(`RENAMED ON ${ops.length} TRADE${ops.length > 1 ? 'S' : ''}`); }
  saveSettings();
}
function removeFromList(key, i) {
  const S = J.set, v = key === 'syms' ? S.syms[i] && S.syms[i].s : S[key][i]; if (v == null) return;
  if (key === 'setups') {
    const used = J.trades.filter(t => t.setup === v); if (!used.length) { S.setups.splice(i, 1); saveSettings(); sheet(settingsHTML()); return; }
    sheet(`<div class="jn-sh"><b>REMOVE A SETUP</b><button type="button" class="jn-x" data-jn="settings" aria-label="Back">✕</button></div><p class="jn-p"><b></b> is used by ${used.length} trade${used.length > 1 ? 's' : ''}. Where should they go?</p>
      <label>MOVE THEM TO<select id="jn-mv">${optList(S.setups.filter(x => x !== v), '', 'No setup')}</select></label><div class="jn-row sp"><button type="button" class="btn" data-jn="settings">CANCEL</button><button type="button" class="btn danger" data-jn="setup-del" data-i="${i}">MOVE AND REMOVE</button></div>`);
    document.querySelector('#jn-sheet .jn-p b').textContent = v; return;
  }
  if (key === 'syms') S.syms.splice(i, 1); else S[key].splice(i, 1); saveSettings(); sheet(settingsHTML());
}

/* ── weekly review ── */
function reviewHTML() {
  const [a0, a1] = weekBounds(0), [b0, b1] = weekBounds(-1), all = acctTrades().filter(t => t.src !== 'backtest');
  const w = all.filter(t => t.t >= a0 && t.t <= a1), p = all.filter(t => t.t >= b0 && t.t <= b1), sw = stats(w), sp = stats(p);
  const brokes = group(w.filter(t => !t.rules), t => t.broke || 'Other').sort((x, y) => y[1].length - x[1].length)[0];
  const best = w.slice().sort((x, y) => y.pnl - x.pnl)[0], worst = w.slice().sort((x, y) => x.pnl - y.pnl)[0];
  const cmp = (l, v, pv, f) => `<div class="jn-cmp"><span>${l}</span><b class="${typeof v === 'number' ? cls(v) : ''}">${f(v)}</b><small>last week ${f(pv)}</small></div>`;
  J.reviewStats = { n: sw.n, total: sw.total, win: sw.win, exp: sw.exp };
  return `<div class="jn-sh"><b>WEEKLY REVIEW</b><button type="button" class="jn-x" data-jn="close" aria-label="Close">✕</button></div>
    <p class="hint">Week of ${E(fmtDate(a0))} · ${sw.n} trades (backtests left out)</p>
    <div class="jn-cmps">${cmp('P&L', sw.total, sp.total, money)}${cmp('Trades', sw.n, sp.n, x => x)}${cmp('Win rate', sw.win, sp.win, pct)}${cmp('Expectancy', sw.exp, sp.exp, rr)}${cmp('Rule breaks', w.filter(t => !t.rules).length, p.filter(t => !t.rules).length, x => x)}</div>
    <div class="jn-grid2 tight"><div class="jn-panel"><h4>BEST TRADE</h4>${best ? `<button type="button" class="jn-tl" data-trade="${E(best.id)}"></button>` : '<span class="jn-dim">—</span>'}</div><div class="jn-panel"><h4>WORST TRADE</h4>${worst ? `<button type="button" class="jn-tl" data-trade="${E(worst.id)}"></button>` : '<span class="jn-dim">—</span>'}</div></div>
    <div class="jn-panel"><h4>MOST BROKEN RULE</h4><p class="jn-p" id="jn-mbr"></p></div>
    <label class="jn-wide">NEXT WEEK I WILL…<textarea id="jn-rtext" rows="3" maxlength="2000" placeholder="One line. One change."></textarea></label>
    <div class="jn-row sp"><span class="hint">${J.set.reviewMission ? 'Saving completes your linked mission if it is due today.' : ''}</span><button type="button" class="btn pri" data-jn="review-save">SAVE REVIEW</button></div>`;
  /* (text filled in by openReview) */
}
function openReview() {
  sheet(reviewHTML(), 'wide');
  const [a0, a1] = weekBounds(0), w = acctTrades().filter(t => t.src !== 'backtest' && t.t >= a0 && t.t <= a1);
  const brokes = group(w.filter(t => !t.rules), t => t.broke || 'Other').sort((x, y) => y[1].length - x[1].length)[0];
  $('jn-mbr').textContent = brokes ? `${brokes[0]} · ${brokes[1].length} time${brokes[1].length > 1 ? 's' : ''} · ${money(brokes[1].reduce((s, t) => s + t.pnl, 0))}` : 'None this week.';
  document.querySelectorAll('#jn-sheet .jn-tl').forEach(b => { const t = J.trades.find(x => x.id === b.dataset.trade); if (t) b.textContent = `${t.sym} · ${t.setup || 'No setup'} · ${money(t.pnl)} · ${fmtTime(t.t)}`; });
}
function saveReview() {
  const [a0] = weekBounds(0), wk = weekKey(a0), text = $('jn-rtext').value.slice(0, 2000);
  const r = cleanReview({ id: jid('r'), week: wk, at: Date.now(), text, stats: J.reviewStats || {} });
  J.reviews = J.reviews.filter(x => x.week !== wk).concat([r]); saveReviews();
  const m = J.set.reviewMission;
  if (m) { const [aid, mid] = m.split('|'); try { const due = dayPlan(dk()).some(p => p.areaId === aid && p.id === mid), done = ((G.history[dk()] || {}).completed || []).includes(mid); if (due && !done) { completeMission(aid, mid); showToast('REVIEW SAVED · MISSION DONE'); } else showToast('REVIEW SAVED'); } catch (e) { showToast('REVIEW SAVED'); } }
  else showToast('REVIEW SAVED');
  sfx('dayDone'); closeSheet(); J.tab = 'reviews'; render();
}

/* ══════════════════════════════════════════════════════
   IMPORT: MetaTrader 5 report (xlsx or html) and CSV. Files are data only.
   ══════════════════════════════════════════════════════ */
function importHTML() {
  return `<div class="jn-sh"><b>IMPORT TRADES</b><button type="button" class="jn-x" data-jn="close" aria-label="Close">✕</button></div>
    <p class="jn-p">In MetaTrader 5 (desktop): <b>History</b> tab → right-click → <b>Report</b> → save as <b>Open XML (.xlsx)</b> or <b>HTML</b>. A CSV with the same columns also works.</p>
    <label class="btn pri jn-up">CHOOSE FILE<input type="file" accept=".xlsx,.html,.htm,.csv,.txt" hidden data-import></label>
    <div id="jn-imp"></div>`;
}
const MT5_COLS = { time: ['time', 'open time', 'opentime'], pos: ['position', 'ticket', 'order'], sym: ['symbol'], type: ['type'], vol: ['volume', 'lots', 'size'], price: ['price', 'open price', 'openprice'],
  sl: ['s / l', 's/l', 'sl', 'stop loss'], tp: ['t / p', 't/p', 'tp', 'take profit'], ctime: ['close time', 'closetime'], cprice: ['close price', 'closeprice'], comm: ['commission'], swap: ['swap'], profit: ['profit'] };
/* rows: array of arrays of strings. Finds the Positions header and reads until the next section. */
function rowsToTrades(rows) {
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  let hi = -1; for (let i = 0; i < rows.length; i++) { const r = rows[i].map(norm); if (r.includes('symbol') && r.includes('profit') && (r.includes('time') || r.includes('open time')) && (r.includes('type'))) { hi = i; break; } }
  if (hi < 0) return { err: 'Could not find a table with Time, Symbol, Type and Profit columns.' };
  const head = rows[hi].map(norm), idx = {};
  head.forEach((h, i) => { for (const k in MT5_COLS) if (MT5_COLS[k].includes(h)) { if (k === 'time' && idx.time != null) { if (idx.ctime == null) idx.ctime = i; } else if (k === 'price' && idx.price != null) { if (idx.cprice == null) idx.cprice = i; } else if (idx[k] == null) idx[k] = i; } });
  const out = [], skipped = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r.some(x => String(x).trim())) { if (out.length) break; continue; }
    const first = norm(r[0]); if (['orders', 'deals', 'open positions', 'working orders', 'summary', 'results'].includes(first)) break;
    const g = k => idx[k] != null ? String(r[idx[k]] == null ? '' : r[idx[k]]).trim() : '';
    const type = norm(g('type')); if (!/^(buy|sell)/.test(type)) { skipped.push([i, 'not a buy or sell row']); continue; }
    const pt = s => { s = String(s).trim(); if (!s) return NaN; if (/^\d+(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) { return Math.round((+s - 25569) * 864e5); } const m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/); if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)); const d = Date.parse(s); return d; };
    const nn = s => { s = String(s).replace(/\s/g, '').replace(/,(?=\d{3}\b)/g, ''); const x = parseFloat(s.replace(',', '.')); return isFinite(x) ? x : null; };
    const t = pt(g('time')), entry = nn(g('price')), lot = nn(g('vol')), profit = nn(g('profit'));
    if (!isFinite(t) || profit == null) { skipped.push([i, 'missing time or profit']); continue; }
    const sl = nn(g('sl')), tp = nn(g('tp')), comm = nn(g('comm')) || 0, swap = nn(g('swap')) || 0, cp = nn(g('cprice')), ct = pt(g('ctime'));
    out.push({ t, close: isFinite(ct) ? ct : null, pos: g('pos'), sym: cleanStr(g('sym'), 20).toUpperCase().replace(/[^A-Z0-9._#-]/g, '') || 'UNKNOWN', dir: type.startsWith('sell') ? -1 : 1, entry, sl: sl ? sl : null, tp: tp ? tp : null, exit: cp, lot, fees: -(comm + swap), profit, net: profit + comm + swap });
  }
  return { rows: out, skipped };
}
function parseCSV(text) {
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : (text.split('\n')[0].includes('\t') ? '\t' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; } else cur += c; }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function parseHTMLReport(text) { const doc = new DOMParser().parseFromString(text, 'text/html'); return [...doc.querySelectorAll('tr')].map(tr => [...tr.children].flatMap(td => { const n = Math.max(1, Math.min(20, +td.getAttribute('colspan') || 1)); return [td.textContent].concat(Array(n - 1).fill('')); })); }
/* xlsx: a zip; read the XML inside it ourselves (DecompressionStream for deflate) */
async function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), files = {};
  let eocd = -1; for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name)) continue;
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), data = u8.subarray(ds, ds + csize);
    if (method === 0) files[name] = new TextDecoder().decode(data);
    else if (method === 8) { if (typeof DecompressionStream === 'undefined') throw new Error('nodecomp'); const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')); files[name] = await new Response(s).text(); }
  }
  return files;
}
async function parseXLSX(buf) {
  const f = await unzip(buf), P = new DOMParser();
  const ss = f['xl/sharedStrings.xml'] ? [...P.parseFromString(f['xl/sharedStrings.xml'], 'application/xml').getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const sheet1 = Object.keys(f).filter(k => k.includes('worksheets')).sort()[0]; if (!sheet1) throw new Error('no sheet');
  const doc = P.parseFromString(f[sheet1], 'application/xml'), rows = [];
  [...doc.getElementsByTagName('row')].forEach(r => { const out = []; [...r.getElementsByTagName('c')].forEach(c => { const ref = c.getAttribute('r') || '', col = ref.replace(/\d+/g, '').split('').reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1, t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], is = c.getElementsByTagName('is')[0];
    out[col >= 0 ? col : out.length] = t === 's' ? (ss[+(v && v.textContent)] || '') : t === 'inlineStr' ? (is ? is.textContent : '') : (v ? v.textContent : ''); }); rows.push(Array.from(out, x => x == null ? '' : x)); });
  return rows;
}
async function readImport(file) {
  const box = $('jn-imp'); box.innerHTML = '<p class="hint">Reading…</p>';
  try {
    let rows; const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx')) { try { rows = await parseXLSX(await file.arrayBuffer()); } catch (e) { box.innerHTML = `<p class="jn-err">${e.message === 'nodecomp' ? 'This browser cannot open .xlsx files. Use the HTML or CSV export from MetaTrader instead.' : 'This .xlsx file could not be read. Try the HTML export.'}</p>`; return; } }
    else { const text = await file.text(); rows = /<table|<tr/i.test(text.slice(0, 200000)) ? parseHTMLReport(text) : parseCSV(text); }
    const res = rowsToTrades(rows); if (res.err) { box.innerHTML = ''; box.appendChild(el('p', { class: 'jn-err' }, res.err)); return; }
    const have = new Set(J.trades.map(t => t.pos).filter(Boolean)), key = r => [r.t, r.sym, r.lot, r.entry].join('|'), haveK = new Set(J.trades.map(key));
    const seen = new Set(), items = res.rows.map(r => { let dup = ''; if (r.pos && have.has(r.pos)) dup = 'already in the journal (same position)'; else if (haveK.has(key(r))) dup = 'already in the journal (same time, symbol, volume, price)'; else if (seen.has(r.pos || key(r))) dup = 'twice in this file'; seen.add(r.pos || key(r)); return { r, dup }; });
    J.imp = { items, skipped: res.skipped, file: file.name };
    const S = J.set, ok = items.filter(x => !x.dup);
    box.innerHTML = `<p class="jn-p"><b>${ok.length}</b> new trade${ok.length === 1 ? '' : 's'} found · ${items.length - ok.length} already in the journal · ${res.skipped.length} other row${res.skipped.length === 1 ? '' : 's'} skipped.</p>
      <div class="jn-fg"><label>SETUP FOR THESE TRADES<select id="jn-isetup">${optList(S.setups, '', 'No setup')}</select></label><label>SOURCE<select id="jn-isrc"><option value="bot">BOT</option><option value="manual">MANUAL</option><option value="backtest">BACKTEST</option></select></label>${J.accts.length > 1 ? `<label>ACCOUNT<select id="jn-iacct">${J.accts.map(a => `<option value="${E(a.id)}">${E(a.name)}</option>`).join('')}</select></label>` : ''}</div>
      <div class="jn-tw"><table class="jn-t"><thead><tr><th>OPEN</th><th>POSITION</th><th>SYMBOL</th><th>SIDE</th><th>LOT</th><th>ENTRY</th><th>S/L</th><th>NET P&L</th><th></th></tr></thead><tbody id="jn-ibody"></tbody></table></div>
      <div class="jn-row sp"><span class="hint">Trades without an S/L are kept as "no stop" and left out of R numbers.</span><button type="button" class="btn pri" data-jn="import-go" ${ok.length ? '' : 'disabled'}>ADD ${ok.length} TRADE${ok.length === 1 ? '' : 'S'}</button></div>`;
    const tb = $('jn-ibody');
    items.slice(0, 400).forEach(({ r, dup }) => { const tr = el('tr', dup ? { class: 'dup' } : null); [fmtTime(r.t), r.pos || '—', r.sym, r.dir > 0 ? 'BUY' : 'SELL', r.lot, r.entry, r.sl == null ? 'none' : r.sl, money(r.net), dup || 'new'].forEach(v => tr.appendChild(el('td', null, String(v)))); tb.appendChild(tr); });
  } catch (e) { box.innerHTML = '<p class="jn-err">This file could not be read.</p>'; }
}
function importGo() {
  const I = J.imp; if (!I) return; const setup = $('jn-isetup').value, src = $('jn-isrc').value, acct = document.getElementById('jn-iacct') ? $('jn-iacct').value : (J.acct !== 'all' ? J.acct : J.accts[0].id), now = Date.now();
  const ops = I.items.filter(x => !x.dup).map(({ r }) => { const cs = csFor(r.sym), risk = r.sl != null && r.entry != null && r.lot != null ? Math.abs(r.entry - r.sl) * r.lot * cs : null;
    return { prev: null, next: cleanTrade({ id: jid('t'), acct, t: r.t, close: r.close, sym: r.sym, dir: r.dir, entry: r.entry, sl: r.sl, tp: r.tp, exit: r.exit, lot: r.lot, cs, fees: r.fees, pnl: r.net, pnlTyped: true, risk, nostop: r.sl == null, setup, src, rules: true, pos: r.pos, created: now, updated: now }) }; }).filter(o => o.next);
  const dupN = I.items.length - ops.length;
  applyOps(ops, true).then(() => { J.lastImport = { added: ops.length, dup: dupN, skipped: I.skipped.length }; showToast(`ADDED ${ops.length} · SKIPPED ${dupN + I.skipped.length}`); J.imp = null; closeSheet(); render(); });
}

/* ── export CSV (respects the filters) ── */
function exportCSV() {
  const a = filtered().a, q = v => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) && isNaN(+s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
  const cols = ['date', 'time_utc', 'account', 'symbol', 'side', 'entry', 'stop', 'take_profit', 'exit', 'lot', 'contract_size', 'fees', 'pnl', 'risked', 'r', 'setup', 'source', 'followed_rules', 'rule_broken', 'mood', 'session', 'mt5_position', 'notes'];
  const lines = [cols.join(',')].concat(a.map(t => [dkey(t.t), new Date(t.t).toISOString(), (J.accts.find(x => x.id === t.acct) || {}).name || t.acct, t.sym, t.dir > 0 ? 'BUY' : 'SELL', t.entry, t.sl, t.tp, t.exit, t.lot, t.cs != null ? t.cs : csFor(t.sym), t.fees, r2(t.pnl), t.risk != null ? r2(t.risk) : '', hasR(t) ? Rof(t).toFixed(2) : '', t.setup, t.src, t.rules ? 'yes' : 'no', t.broke, t.mood, sessionOf(t.t), t.pos, t.note].map(q).join(',')));
  const b = new Blob([lines.join('\n')], { type: 'text/csv' }), u = URL.createObjectURL(b), x = el('a', { href: u, download: `life-journal-${todayKey()}.csv` });
  document.body.appendChild(x); x.click(); x.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); showToast(`EXPORTED ${a.length} TRADES`);
}
J.exportCSV = exportCSV;

/* ══════════════════════════════════════════════════════
   EVENTS
   ══════════════════════════════════════════════════════ */
function onClick(e) {
  const t = e.target, b = t.closest('[data-jn]'), menu = $('jn-menu');
  if (menu && !menu.hidden && !t.closest('#jn-menu') && !(b && b.dataset.jn === 'more')) { menu.hidden = true; document.querySelector('[data-jn="more"]').setAttribute('aria-expanded', 'false'); }
  if (b && !b.disabled) {
    const a = b.dataset.jn;
    if (a === 'back') return close(); if (a === 'undo') return undo();
    if (a === 'new') return openForm(null); if (a === 'quick') { J.qrules = true; return sheet(quickHTML()); }
    if (a === 'more') { menu.hidden = !menu.hidden; b.setAttribute('aria-expanded', String(!menu.hidden)); return; }
    if (a === 'close') return closeSheet();
    if (a === 'import') { menu.hidden = true; return sheet(importHTML(), 'wide'); }
    if (a === 'import-go') return importGo();
    if (a === 'export') { menu.hidden = true; return exportCSV(); }
    if (a === 'settings') { menu.hidden = true; return sheet(settingsHTML(), 'wide'); }
    if (a === 'review') { menu.hidden = true; return openReview(); }
    if (a === 'review-save') return saveReview();
    if (a === 'edit') { const tr = J.trades.find(x => x.id === J.detail); if (tr) openForm(tr); return; }
    if (a === 'delete') return askDelete(J.form && J.form.trade ? J.form.trade.id : J.detail);
    if (a === 'acct-add') { J.accts.push({ id: jid('acct-'), name: 'Account ' + (J.accts.length + 1), start: 0, kind: 'demo' }); saveAccts(); sheet(settingsHTML(), 'wide'); return; }
    if (a === 'setup-del') { const i = +b.dataset.i, v = J.set.setups[i], to = $('jn-mv').value, ops = J.trades.filter(x => x.setup === v).map(x => ({ prev: x, next: Object.assign({}, x, { setup: to, updated: Date.now() }) })); J.set.setups.splice(i, 1); saveSettings(); applyOps(ops, true); showToast(`MOVED ${ops.length} TRADES`); sheet(settingsHTML(), 'wide'); return; }
    if (a === 'wipe') { confirmBox('Delete ALL journal data on this device?<br><br>Trades, screenshots, settings and reviews. Your game is not affected. Export first if unsure.', 'DELETE ALL', () => wipe().then(() => { showToast('JOURNAL CLEARED'); closeSheet(); render(); }), 'DELETE'); return; }
    if (a === 'reset-journal') { wipe().then(() => { showToast('JOURNAL RESET'); closeSheet(); render(); }); return; }
  }
  const tab = t.closest('[data-tab]'); if (tab) { J.tab = tab.dataset.tab; J.selDay = null; sfx('tick'); render(); $('jn-main').focus({ preventScroll: true }); return; }
  const cal = t.closest('[data-cal]'); if (cal) { J.calMonth = new Date(J.calMonth.getFullYear(), J.calMonth.getMonth() + +cal.dataset.cal, 1); J.selDay = null; render(); return; }
  const cm = t.closest('[data-calmode]'); if (cm) { J.calMode = cm.dataset.calmode; render(); return; }
  const day = t.closest('[data-day]'); if (day) { J.selDay = J.selDay === day.dataset.day ? null : day.dataset.day; render(); return; }
  const so = t.closest('[data-sort]'); if (so) { const k = so.dataset.sort; J.sort = { k, d: J.sort.k === k ? -J.sort.d : -1 }; render(); return; }
  const tr = t.closest('[data-trade]'); if (tr) { openDetail(tr.dataset.trade); return; }
  const nav = t.closest('[data-nav]'); if (nav && !nav.disabled) { const list = filtered().a.slice().sort((x, y) => x.t - y.t), i = list.findIndex(x => x.id === J.detail), n2 = list[i + +nav.dataset.nav]; if (n2) openDetail(n2.id); return; }
  const side = t.closest('[data-side]'); if (side && J.form) { J.form.dir = +side.dataset.side; document.querySelectorAll('#jn-form [data-side]').forEach(x => { const on = +x.dataset.side === J.form.dir; x.classList.toggle('on', on); x.classList.toggle('buy', on && J.form.dir > 0); x.classList.toggle('sell', on && J.form.dir < 0); x.setAttribute('aria-checked', on); }); preview(); return; }
  const ru = t.closest('[data-rules]'); if (ru && J.form) { J.form.rules = ru.dataset.rules === '1'; document.querySelectorAll('#jn-form [data-rules]').forEach(x => x.classList.toggle('on', x === ru)); document.querySelector('#jn-form .jn-broke').hidden = J.form.rules; return; }
  const qr = t.closest('[data-qrules]'); if (qr) { J.qrules = qr.dataset.qrules === '1'; document.querySelectorAll('#jn-qform [data-qrules]').forEach(x => x.classList.toggle('on', x === qr)); document.querySelector('#jn-qform .jn-qbroke').hidden = J.qrules; return; }
  const sd = t.closest('[data-shdel]'); if (sd && J.form) { const id = sd.dataset.shdel; J.form.shots = J.form.shots.filter(x => x !== id); J.form.add = J.form.add.filter(x => x.id !== id); shotList(); return; }
  const la = t.closest('[data-ladd]'); if (la) { const k = la.dataset.ladd, inp = document.querySelector(`[data-lnew="${k}"]`), v = cleanStr(inp.value, 80); if (!v) return; if (k === 'syms') { const s = v.toUpperCase(); if (!J.set.syms.some(x => x.s === s)) J.set.syms.push({ s, cs: s === 'XAUUSD' ? 100 : 1 }); } else if (!J.set[k].includes(v)) J.set[k].push(v); saveSettings(); sheet(settingsHTML(), 'wide'); return; }
  const ld = t.closest('[data-ldel]'); if (ld) return removeFromList(ld.dataset.ldel, +ld.dataset.i);
  const ad = t.closest('[data-adel]'); if (ad) { const i = +ad.dataset.adel, A = J.accts[i], n = J.trades.filter(x => x.acct === A.id).length; if (n) { showToast(`MOVE OR DELETE ITS ${n} TRADES FIRST`); return; } J.accts.splice(i, 1); if (J.acct === A.id) J.acct = 'all'; saveAccts(); sheet(settingsHTML(), 'wide'); return; }
  if (t === $('jn-sheet')) closeSheet();   /* a click outside the sheet closes it */
}
function onChange(e) {
  const t = e.target;
  if (t.dataset.f) { J.f[t.dataset.f] = t.value; J.selDay = null; render(); return; }
  if (t.dataset.shot != null && J.form) { const files = [...t.files].slice(0, 3 - J.form.shots.length - J.form.add.length); t.value = ''; Promise.all(files.map(f => shrink(f).catch(() => null))).then(rs => { rs.filter(Boolean).forEach(r => J.form.add.push(r)); shotList(); const u = document.getElementById('jn-used'); if (u) u.textContent = ((J.shotsBytes + J.form.add.reduce((s, a) => s + a.size, 0)) / 1048576).toFixed(1) + ' MB'; }); return; }
  if (t.dataset.import != null) { const f = t.files && t.files[0]; t.value = ''; if (f) readImport(f); return; }
  if (t.dataset.set) { const k = t.dataset.set; J.set[k] = k === 'reviewMission' ? t.value : Math.max(0, num(t.value) || 0); if (k === 'maxTrades') J.set[k] = Math.round(J.set[k]); saveSettings(); renderLimit(); return; }
  if (t.dataset.list) { setListValue(t.dataset.list, +t.dataset.i, t.dataset.k, t.value); return; }
  if (t.dataset.acct != null) { const A = J.accts[+t.dataset.acct]; if (!A) return; const k = t.dataset.k; if (k === 'start') A.start = Math.max(0, num(t.value) || 0); else if (k === 'kind') A.kind = t.value; else { const v = cleanStr(t.value, 40); if (v) A.name = v; } saveAccts(); return; }
  if (t.closest('#jn-form')) preview();
}
function onInput(e) {
  const t = e.target;
  if (t.closest('#jn-form')) preview();
  if (t.dataset.q != null) { J.q = t.value; clearTimeout(J.qT); J.qT = setTimeout(() => { const pos = t.selectionStart; render(); const s = document.querySelector('#jn-main [data-q]'); if (s) { s.focus(); try { s.setSelectionRange(pos, pos); } catch (er) {} } }, 160); }
}
function onKey(e) {
  if (e.key === 'Enter' && e.target.closest('[data-trade]') && e.target.matches('tr,button')) { e.preventDefault(); openDetail(e.target.closest('[data-trade]').dataset.trade); }
}
document.addEventListener('submit', e => { if (e.target.id === 'jn-form') { e.preventDefault(); saveForm(); } else if (e.target.id === 'jn-qform') { e.preventDefault(); saveQuick(); } });
addEventListener('keydown', e => {
  if (curPage !== 'pg-journal' || document.querySelector('.modal.open, #confirm.open')) return;
  const typing = e.target.matches && e.target.matches('input,textarea,select');
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); const m = $('jn-menu'); if (m && !m.hidden) { m.hidden = true; return; } if (!$('jn-sheet').hidden) closeSheet(); else close(); return; }
  if (typing) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  if (!$('jn-sheet').hidden && J.detail && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { const b = document.querySelector(`#jn-sheet [data-nav="${e.key === 'ArrowLeft' ? -1 : 1}"]`); if (b && !b.disabled) b.click(); }
}, true);
function wipe() {
  J.trades = []; J.set = defSettings(); J.accts = [defAcct()]; J.reviews = []; J.undo = []; J.redo = []; J.shotsBytes = 0; changed();
  return tx(['trades', 'shots', 'kv'], 'readwrite', t => { ['trades', 'shots', 'kv'].forEach(s => t.objectStore(s).clear()); }).then(bumpRev).catch(() => warn(true));
}

/* ══════════════════════════════════════════════════════
   BACKUP: the journal rides along in the normal backup file (screenshots only if you say so).
   Old backups without a journal still import.
   ══════════════════════════════════════════════════════ */
async function backup(withShots) {
  await load();
  const o = { v: JVER, trades: J.trades, settings: J.set, accounts: J.accts, reviews: J.reviews };
  if (withShots) { const sh = await tx(['shots'], 'readonly', t => t.objectStore('shots').getAll()).catch(() => []); o.shots = await Promise.all((sh || []).map(s => new Promise(res => { const r = new FileReader(); r.onload = () => res({ id: s.id, w: s.w, h: s.h, data: r.result }); r.onerror = () => res(null); r.readAsDataURL(s.blob); }))).then(x => x.filter(Boolean)); }
  return o;
}
J.backup = backup;
J.backupSync = () => J.loaded ? { v: JVER, trades: J.trades, settings: J.set, accounts: J.accts, reviews: J.reviews } : undefined;
async function restore(o) {
  if (!o || typeof o !== 'object') return false;
  const trades = (Array.isArray(o.trades) ? o.trades : []).map(cleanTrade).filter(Boolean), set = cleanSettings(o.settings), accts = (Array.isArray(o.accounts) ? o.accounts : []).map(cleanAcct).filter(Boolean), reviews = (Array.isArray(o.reviews) ? o.reviews : []).map(cleanReview).filter(Boolean);
  const shots = [];
  for (const s of (Array.isArray(o.shots) ? o.shots : [])) { if (!s || !s.id || typeof s.data !== 'string' || !/^data:image\/(webp|jpeg|png);base64,/.test(s.data)) continue; const b = await (await fetch(s.data)).blob(); shots.push({ id: cleanStr(s.id, 60), blob: b, w: +s.w || 0, h: +s.h || 0, size: b.size, type: b.type }); }
  await tx(['trades', 'shots', 'kv'], 'readwrite', t => {
    const ts = t.objectStore('trades'), ss = t.objectStore('shots'), kv = t.objectStore('kv'); ts.clear(); kv.clear(); if (o.shots) ss.clear();
    trades.forEach(x => ts.put(x)); shots.forEach(x => ss.put(x)); kv.put({ id: 'settings', v: set }); kv.put({ id: 'accounts', v: accts.length ? accts : [defAcct()] }); kv.put({ id: 'reviews', v: reviews });
  });
  bumpRev(); J.undo = []; J.redo = []; await load(true); return true;
}
J.restore = restore;
/* the main Backup button asks about screenshots when there are some */
const _exp = window.exportBackup;
window.exportBackup = exportBackup = function () {
  load().then(() => {
    const go = async withShots => {
      const payload = { app: 'LIFE', schema: SCHEMA, exportedAt: new Date().toISOString(), data: G, maps: mapBackup(), guide: (typeof GUIDE !== 'undefined' && GUIDE.backup ? GUIDE.backup() : undefined), journal: await backup(withShots) };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `life-game-backup-${dk()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); showToast('BACKUP DOWNLOADED');
    };
    if (J.shotsBytes > 0 && J.set.shotsInBackup == null) {
      confirmBox(`Your journal has ${(J.shotsBytes / 1048576).toFixed(1)} MB of trade screenshots.<br><br>Put them in this backup too? (Cancel = backup without screenshots.)`, 'INCLUDE SCREENSHOTS', () => { J.jnShotsYes = true; });
      const yes = $('confirm-yes'), was = J.jnShotsYes = false;
      const done = () => { const c = document.getElementById('confirm'); if (c && c.classList.contains('open')) return setTimeout(done, 120); go(!!J.jnShotsYes); };
      setTimeout(done, 120);
    } else go(!!J.set.shotsInBackup);
  });
};
let pendingJ = null;
function readBackup(txt) { pendingJ = null; try { const o = JSON.parse(txt); if (o && o.app === 'LIFE' && o.journal && typeof o.journal === 'object') pendingJ = { j: o.journal, at: Date.now() }; } catch (e) {} }
const impf = document.getElementById('imp-file'); if (impf) impf.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; pendingJ = null; if (!f) return; const r = new FileReader(); r.onload = () => readBackup(r.result); r.readAsText(f); });
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-bk="go"]'); if (b) { const t = document.getElementById('bk-paste'); readBackup(t ? t.value : ''); } }, true);
const _toastJ = showToast;
window.showToast = showToast = function (msg) {
  const r = _toastJ.apply(this, arguments);
  if (msg === 'BACKUP RESTORED' && pendingJ && Date.now() - pendingJ.at < 10 * 60000) {
    const P = pendingJ; pendingJ = null; const n = Array.isArray(P.j.trades) ? P.j.trades.length : 0;
    setTimeout(() => { const ask = () => { const c = document.getElementById('confirm'); if (c && c.classList.contains('open')) return setTimeout(ask, 300); confirmBox(`This backup also has a trading journal with ${n} trade${n === 1 ? '' : 's'}.<br><br>Replace the journal on this device with it?`, 'REPLACE JOURNAL', () => { restore(P.j).then(() => { _toastJ('JOURNAL RESTORED'); if (curPage === 'pg-journal') render(); }).catch(() => _toastJ('JOURNAL COULD NOT BE RESTORED')); }); }; ask(); }, 900);
  }
  return r;
};

/* ══════════════════════════════════════════════════════
   WHERE IT OPENS: a tile on page 2 next to MAP, a button in the Trading area, and the ⋯ menu
   ══════════════════════════════════════════════════════ */
const ICON = '<svg viewBox="0 0 24 24"><path d="M4 19V5"/><path d="M4 19h16"/><rect x="7" y="9" width="3" height="6" rx=".6"/><path d="M8.5 7v2M8.5 15v2"/><rect x="13" y="7" width="3" height="5" rx=".6"/><path d="M14.5 5v2M14.5 12v3"/><path d="M18 6l1.5 1.5L22 5"/></svg>';
function addEntry() {
  const box = document.querySelector('#pg-profile .cs-box');
  if (box && !box.querySelector('.fb.jnl')) { const d = el('div', { class: 'fb big jnl', role: 'button', tabindex: '0', 'aria-label': 'Trading journal' }); d.innerHTML = `<i class="ic">${ICON}</i><b>JOURNAL</b><small>TRADING LOG</small>`; d.addEventListener('click', open); d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }); box.appendChild(d); }
  const dm = document.getElementById('dots-menu'); if (dm && !dm.querySelector('[data-jnopen]')) { const b = el('button', { type: 'button', role: 'menuitem', 'data-jnopen': '1' }, 'JOURNAL'); b.addEventListener('click', () => { dm.classList.remove('open'); open(); }); dm.insertBefore(b, dm.children[1] || null); }
}
addEntry();
const isTradingArea = id => { const a = G && G.areas && G.areas[id]; return !!a && (id === 'trading' || /trad/i.test(a.name || '')); };
const _rmJ = renderMissions;
window.renderMissions = renderMissions = function (areaId) {
  const r = _rmJ.apply(this, arguments);
  try { if (isTradingArea(areaId)) { const list = $('missions-list'); if (list && !list.querySelector('.jn-entry')) { const b = el('button', { type: 'button', class: 'jn-entry' }); b.innerHTML = `<i>${ICON}</i><span><b>TRADING JOURNAL</b><small></small></span><em>OPEN ›</em>`; b.addEventListener('click', open);
    const head = list.querySelector('.missions-area-title'); if (head) head.after(b); else list.prepend(b);
    load().then(() => { const s = b.querySelector('small'); if (s) { const L = todayInfo(); s.textContent = L.hit ? 'Daily limit hit · stop for today' : `${J.trades.length} trades · today ${money(L.pnl)}`; b.classList.toggle('hit', L.hit); } }); } } } catch (e) {}
  return r;
};
/* ── the guide says one calm line on the area page when the daily limit was hit today (once a day) ── */
const _navJ = navigateTo;
window.navigateTo = navigateTo = function (id) {
  const r = _navJ.apply(this, arguments);
  if (id === 'pg-bubbles') setTimeout(() => { let said = ''; try { said = localStorage.getItem('life_jn_limitsaid'); } catch (e) {} if (said === todayKey()) return;
    load().then(() => { const L = todayInfo(); if (!L.hit || curPage !== 'pg-bubbles' || typeof GUIDE === 'undefined' || !GUIDE.say) return;
      const line = L.byLoss ? [[`Trading is done for today. You reached your loss limit, and stopping is the plan working. Tomorrow is a clean page.`, false]] : [[`That was your last trade for today. The daily count is reached. Rest your eyes, come back tomorrow.`, false]];
      if (GUIDE.say([line], { auto: true })) try { localStorage.setItem('life_jn_limitsaid', todayKey()); } catch (e) {} }); }, 1000);
  return r;
};
/* preload the journal data in an idle moment, so the other backup buttons can include it */
(window.requestIdleCallback || (f => setTimeout(f, 4000)))(() => { if (!document.hidden) load(); });
})();
