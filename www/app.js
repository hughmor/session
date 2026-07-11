/* ---------------- App orchestration ----------------
   Boots the store, wires the three tabs (Log / Progress / Setup), and renders
   each view. Working state (set-dots, dropdown picks, in-progress entry values)
   lives in memory; only logged sessions + settings are persisted via store.js. */

import { GROUPS, SCHEDULE, ORDER, PLOT_GROUPS, schemeFor, modeOf, fullDay } from './data.js';
import { Store, installFlushOnPause, isNative } from './store.js';
import { seedPrimary, seedSecondary, fromDisplay, toDisplay, fmt, kgToLb } from './overload.js';
import { e1rm } from './e1rm.js';
import { renderChart } from './charts.js';
import { exportJSON } from './export.js';

const Cap = window.Capacitor;

/* ---------------- Working state ---------------- */
const state = {
  week: 'A',
  day: 'Tue',
  tab: 'log',
  range: '6M',   // progress-plot time window: 3M | 6M | 1Y | All
  picks: {},     // setKey -> secondary option index
  sets: {},      // setKey -> completed set count
  entries: {}    // setKey -> { weightKg, reps, amrap, seeded }
};

const setKeyOf = key => `${state.week}|${state.day}|${key}`;
const roleOf = key => SCHEDULE[state.week][state.day].includes(key) ? 'P' : 'S';
const unit = () => Store.settings.unit;
const toDisp = kg => kg == null ? null : (unit() === 'lb' ? kgToLb(kg) : kg); // no rounding (plots)

function autoPickDay(){
  const now = new Date().getDay();  // 0 Sun .. 6 Sat
  if(now === 0) return 'Sun';
  if(now >= 4) return 'Thu';        // Thu/Fri/Sat lean Thu
  return 'Tue';
}
function localISO(){
  const d = new Date();
  const off = -d.getTimezoneOffset();          // minutes east of UTC
  const s = off >= 0 ? '+' : '-';
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
    + `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    + `${s}${p(Math.floor(Math.abs(off)/60))}:${p(Math.abs(off)%60)}`;
}
function intOrNull(v){ const s=String(v??'').trim(); if(!s) return null; const n=parseInt(s,10); return (isNaN(n)||n<0)?null:n; }
function floatOrNull(v){ const s=String(v??'').trim(); if(!s) return null; const n=parseFloat(s); return (isNaN(n)||n<0)?null:n; }

/* ---------------- Toast ---------------- */
let toastTimer = null;
function toast(msg, warn=false){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('warn', warn);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
}

/* =====================================================================
   LOG VIEW
   ===================================================================== */
const list = document.getElementById('list');

function ensureEntry(sk){
  if(!state.entries[sk]) state.entries[sk] = { weightKg:null, reps:null, amrap:null, seeded:false };
  return state.entries[sk];
}

function renderLog(){
  document.getElementById('eyebrow').textContent = `Week ${state.week} · ${fullDay(state.day)}`;
  const primaries = SCHEDULE[state.week][state.day].map(k => GROUPS[k].short);
  document.getElementById('daytitle').innerHTML =
    `${primaries.slice(0,-1).join(', ')} & <span class="accent">${primaries.slice(-1)}</span>`;

  syncChips();
  list.innerHTML = '';
  ORDER.forEach(key => list.appendChild(buildCard(key)));
  updateProgress();
}

function buildCard(key){
  const g = GROUPS[key];
  const role = roleOf(key);
  const scheme = schemeFor(key, role);
  const mode = modeOf(key, role);
  const sk = setKeyOf(key);
  if(!(sk in state.sets)) state.sets[sk] = 0;
  const e = ensureEntry(sk);

  const chosenLabel = role === 'P' ? g.primary : g.secondary[state.picks[sk] ?? 0].label;

  // ---- seed recommended value once (per fresh entry) ----
  if(!e.seeded){
    const seed = role === 'P'
      ? seedPrimary(key, Store.sessions, Store.settings)
      : seedSecondary(key, chosenLabel, Store.sessions);
    if(seed){
      if(seed.mode === 'weight') e.weightKg = seed.weightKg;
      else e.reps = seed.reps;
    }
    e.seeded = true;
  }

  const el = document.createElement('section');
  el.className = 'card';

  // ---- top row
  const top = document.createElement('div'); top.className = 'card-top';
  top.innerHTML = `<div class="grp">
      <span class="tag ${role.toLowerCase()}">${role==='P'?'Primary':'Secondary'}</span>
      <span class="grpname">${g.name}</span>
    </div>
    <div class="scheme"><b>${scheme.sets}</b>×<b>${scheme.reps}</b></div>`;
  el.appendChild(top);

  // ---- exercise line
  const exline = document.createElement('div'); exline.className = 'exline';
  if(role === 'P'){
    exline.innerHTML = `<div class="exname">${g.primary}</div>`;
  } else {
    const chosen = state.picks[sk] ?? 0;
    const opts = g.secondary.map((s,i)=>`<option value="${i}" ${i==chosen?'selected':''}>${s.label}</option>`).join('');
    const sel = document.createElement('select');
    sel.innerHTML = opts;
    sel.setAttribute('aria-label', `Choose ${g.name} secondary exercise`);
    sel.onchange = ev => {
      state.picks[sk] = +ev.target.value;
      // re-seed for the newly chosen accessory (unless user has typed something)
      e.seeded = false; e.weightKg = null; e.reps = null;
      renderLog();
    };
    exline.appendChild(sel);
    const note = document.createElement('div'); note.className = 'exnote';
    const n = g.secondary[chosen].note;
    note.textContent = n || '';
    note.style.display = n ? 'block' : 'none';
    exline.appendChild(note);
  }
  el.appendChild(exline);

  // ---- entry inputs (weight/reps + AMRAP on primary)
  el.appendChild(buildEntry(key, role, mode, e));

  // ---- set dots
  const sets = document.createElement('div'); sets.className = 'sets';
  const lab = document.createElement('span'); lab.className = 'sets-label'; lab.textContent = 'Sets';
  sets.appendChild(lab);
  const done = state.sets[sk];
  for(let i=1;i<=scheme.sets;i++){
    const d = document.createElement('button');
    d.className = 'dot' + (i<=done ? ' on' : '');
    d.textContent = i;
    d.setAttribute('aria-label', `Set ${i} of ${scheme.sets}`);
    d.setAttribute('aria-pressed', i<=done);
    d.onclick = () => {
      state.sets[sk] = (state.sets[sk]===i) ? i-1 : i;
      renderLog();
    };
    sets.appendChild(d);
  }
  el.appendChild(sets);

  if(done >= scheme.sets) el.classList.add('complete');
  return el;
}

function buildEntry(key, role, mode, e){
  const wrap = document.createElement('div'); wrap.className = 'entry';
  const u = unit();

  if(mode === 'weight'){
    const dv = fmt(toDisplay(e.weightKg, u));
    wrap.innerHTML = `<label class="field">
        <span class="field-lab">Working weight</span>
        <span class="field-in has-unit">
          <input inputmode="decimal" enterkeyhint="done" data-in="weight" value="${dv}" placeholder="—" aria-label="${GROUPS[key].name} working weight">
          <span class="unit">${u}</span>
        </span>
      </label>`;
  } else {
    const rv = e.reps != null ? e.reps : '';
    wrap.innerHTML = `<label class="field">
        <span class="field-lab">Working reps</span>
        <span class="field-in">
          <input inputmode="numeric" enterkeyhint="done" data-in="reps" value="${rv}" placeholder="reps" aria-label="${GROUPS[key].name} working reps">
        </span>
      </label>`;
  }

  if(role === 'P'){
    const av = e.amrap != null ? e.amrap : '';
    const amrap = document.createElement('label'); amrap.className = 'field';
    amrap.innerHTML = `<span class="field-lab">AMRAP · last set</span>
      <span class="field-in">
        <input inputmode="numeric" enterkeyhint="done" data-in="amrap" value="${av}" placeholder="reps" aria-label="${GROUPS[key].name} AMRAP reps">
      </span>`;
    wrap.appendChild(amrap);
  }

  // wire inputs -> entry (no re-render, to preserve focus/caret while typing)
  wrap.querySelectorAll('input[data-in]').forEach(inp => {
    inp.oninput = () => {
      const kind = inp.dataset.in;
      if(kind === 'weight')      e.weightKg = fromDisplay(inp.value, unit());
      else if(kind === 'reps')   e.reps = intOrNull(inp.value);
      else if(kind === 'amrap')  e.amrap = intOrNull(inp.value);
    };
  });
  return wrap;
}

function updateProgress(){
  let total=0, done=0;
  ORDER.forEach(key => {
    const role = roleOf(key);
    const need = schemeFor(key, role).sets;
    const sk = setKeyOf(key);
    total += need;
    done += Math.min(state.sets[sk]||0, need);
  });
  const pct = total ? Math.round(done/total*100) : 0;
  document.getElementById('progfill').style.width = pct + '%';
  document.getElementById('progpct').textContent = pct + '%';
  document.getElementById('logbtn').classList.toggle('ready', pct === 100);
}

function buildSession(){
  const exercises = ORDER.map(key => {
    const role = roleOf(key);
    const scheme = schemeFor(key, role);
    const mode = modeOf(key, role);
    const sk = setKeyOf(key);
    const g = GROUPS[key];
    const label = role === 'P' ? g.primary : g.secondary[state.picks[sk] ?? 0].label;
    const e = state.entries[sk] || {};
    return {
      group: key, role, exercise: label, mode,
      weightKg: mode==='weight' ? (e.weightKg ?? null) : null,
      reps:     mode==='reps'   ? (e.reps ?? null) : null,
      setsCompleted: Math.min(state.sets[sk]||0, scheme.sets),
      setsPrescribed: scheme.sets,
      repsPrescribed: scheme.reps,
      amrap: role==='P' ? (e.amrap ?? null) : null
    };
  });
  return {
    id: `${Date.now()}-${Math.round(Math.random()*1e6)}`,
    datetime: localISO(),
    week: state.week,
    day: state.day,
    unit: Store.settings.unit,
    bodyweightKg: Store.settings.bodyweightKg ?? null,
    exercises
  };
}

function doLog(){
  const session = buildSession();
  const anySets = session.exercises.some(x => x.setsCompleted > 0);
  const anyData = session.exercises.some(x => x.weightKg != null || x.reps != null);
  if(!anySets && !anyData){
    toast('Log some sets first', true);
    return;
  }
  Store.appendSession(session);
  // reset the day so it can't be double-logged; clear entries so they re-seed
  // from the freshly-updated history (progression applied).
  ORDER.forEach(key => { const sk = setKeyOf(key); state.sets[sk] = 0; delete state.entries[sk]; });
  toast('Workout logged ✓');
  renderLog();
}

/* =====================================================================
   PROGRESS VIEW
   ===================================================================== */
const RANGE_MS = { '3M': 3, '6M': 6, '1Y': 12 };  // months
function rangeCutoff(){
  const months = RANGE_MS[state.range];
  if(!months) return -Infinity;                    // 'All'
  return Date.now() - months * 30.44 * 864e5;
}

function chartPoints(key){
  const mode = modeOf(key, 'P');
  const cutoff = rangeCutoff();
  const pts = [];
  Store.sessions.forEach(s => {
    const t = Date.parse(s.datetime);
    if(isNaN(t) || t < cutoff) return;
    s.exercises.forEach(ex => {
      if(ex.group !== key || ex.role !== 'P') return;
      if(mode === 'weight'){
        if(ex.weightKg == null) return;
        const reps = ex.amrap ?? ex.repsPrescribed ?? 5;
        const est = e1rm(ex.weightKg, reps);
        if(est == null) return;
        pts.push({ t, y: toDisp(est) });
      } else {
        const r = ex.amrap ?? ex.reps;
        if(r == null || r < 1) return;
        pts.push({ t, y: r });
      }
    });
  });
  pts.sort((a,b) => a.t - b.t);
  return pts;
}

function goalFor(key){
  const st = Store.settings;
  if(key === 'pull') return st.pullupGoalReps ?? null;
  if(st.bodyweightKg == null) return null;
  const mult = st.goals[key];
  if(mult == null) return null;
  return toDisp(mult * st.bodyweightKg);
}

function renderProgress(){
  document.querySelectorAll('[data-range]').forEach(b =>
    b.setAttribute('aria-pressed', b.dataset.range === state.range));
  const u = unit();
  const html = PLOT_GROUPS.map(key => {
    const mode = modeOf(key, 'P');
    return renderChart({
      title: GROUPS[key].primary,
      subtitle: mode === 'weight' ? `Est. 1RM · ${u}` : 'Top-set reps',
      unit: u,
      mode: mode === 'weight' ? 'weight' : 'reps',
      points: chartPoints(key),
      goal: goalFor(key)
    });
  }).join('');
  document.getElementById('charts').innerHTML = html;
}

/* =====================================================================
   SETUP VIEW
   ===================================================================== */
function renderSetup(){
  const st = Store.settings;
  const u = st.unit;
  const incDisp = fmt(toDisplay(st.incrementKg, u));
  const bwDisp = st.bodyweightKg != null ? fmt(toDisplay(st.bodyweightKg, u)) : '';

  const goalRow = (key, name) => {
    const mult = st.goals[key];
    const abs = st.bodyweightKg != null && mult != null ? fmt(toDisplay(mult*st.bodyweightKg, u)) : '—';
    return `<div class="setup-row">
        <div><label for="goal-${key}">${name}</label><div class="sub">× bodyweight</div></div>
        <input id="goal-${key}" type="number" step="0.05" inputmode="decimal" data-goal="${key}" value="${mult ?? ''}">
        <div class="goalval">${abs}${abs!=='—'?' '+u:''}</div>
      </div>`;
  };

  document.getElementById('setup').innerHTML = `
    <div class="setup-card">
      <h2>Units</h2>
      <div class="setup-row">
        <label>Weight unit</label>
        <div class="unit-toggle">
          <button class="chip" data-unit="kg" aria-pressed="${u==='kg'}">kg</button>
          <button class="chip" data-unit="lb" aria-pressed="${u==='lb'}">lb</button>
        </div>
      </div>
    </div>

    <div class="setup-card">
      <h2>Progression</h2>
      <div class="hint">Added to a primary lift next time you complete all sets and beat 5 reps on the AMRAP set.</div>
      <div class="setup-row">
        <div><label for="inc">Increment</label><div class="sub">per progression</div></div>
        <input id="inc" type="number" step="0.5" inputmode="decimal" value="${incDisp}"><span class="goalval">${u}</span>
      </div>
      <div class="setup-row">
        <div><label for="bw">Bodyweight</label><div class="sub">used for goal weights</div></div>
        <input id="bw" type="number" step="0.5" inputmode="decimal" value="${bwDisp}"><span class="goalval">${u}</span>
      </div>
    </div>

    <div class="setup-card">
      <h2>Goals</h2>
      <div class="hint">Target 1RM as a multiple of bodyweight. Shown as the dotted line on each plot.</div>
      ${goalRow('push','Bench Press')}
      ${goalRow('press','Overhead Press')}
      ${goalRow('squat','Back Squat')}
      ${goalRow('hinge','Deadlift')}
      <div class="setup-row">
        <div><label for="goal-pull">Pull-ups</label><div class="sub">target reps</div></div>
        <input id="goal-pull" type="number" step="1" inputmode="numeric" value="${st.pullupGoalReps ?? ''}">
        <div class="goalval">reps</div>
      </div>
    </div>

    <div class="setup-card">
      <h2>Data</h2>
      <div class="hint">Export the full log as JSON, import a saved log, or remove the most recent session.</div>
      <button class="setup-btn accent" id="export">Export data (JSON)</button>
      <button class="setup-btn" id="import">Import data (JSON)</button>
      <input type="file" id="importfile" accept="application/json,.json" hidden>
      <button class="setup-btn danger" id="dellast">Delete last session</button>
      <div class="hint" id="sesscount" style="margin-top:10px;margin-bottom:0;"></div>
    </div>
  `;

  document.getElementById('sesscount').textContent =
    `${Store.sessions.length} session${Store.sessions.length===1?'':'s'} logged`;

  wireSetup();
}

function wireSetup(){
  document.querySelectorAll('[data-unit]').forEach(b => b.onclick = () => {
    Store.saveSettings({ unit: b.dataset.unit });
    renderSetup();
  });
  document.getElementById('inc').onchange = e => {
    const kg = fromDisplay(e.target.value, unit());
    if(kg != null) Store.saveSettings({ incrementKg: kg });
  };
  document.getElementById('bw').onchange = e => {
    Store.saveSettings({ bodyweightKg: fromDisplay(e.target.value, unit()) });
    renderSetup();
  };
  document.querySelectorAll('[data-goal]').forEach(inp => inp.onchange = () => {
    const g = {}; g[inp.dataset.goal] = floatOrNull(inp.value);
    Store.saveSettings({ goals: g });
    renderSetup();
  });
  document.getElementById('goal-pull').onchange = e => {
    Store.saveSettings({ pullupGoalReps: intOrNull(e.target.value) });
  };
  document.getElementById('export').onclick = async () => {
    try{
      const res = await exportJSON({ schemaVersion:1, exportedAt: localISO(), settings: Store.settings, sessions: Store.sessions });
      toast(isNative() ? 'Sharing ' + res.filename : 'Downloaded ' + res.filename);
    }catch(err){ toast('Export failed', true); console.error(err); }
  };
  const importFile = document.getElementById('importfile');
  document.getElementById('import').onclick = () => importFile.click();
  importFile.onchange = async () => {
    const f = importFile.files && importFile.files[0];
    if(!f) return;
    try{
      const data = JSON.parse(await f.text());
      const n = Store.importData(data);
      renderSetup();
      toast(`Imported ${n} session${n===1?'':'s'} ✓`);
    }catch(err){
      toast('Import failed — bad file', true);
      console.error(err);
    }
    importFile.value = '';
  };
  document.getElementById('dellast').onclick = () => {
    if(!Store.sessions.length){ toast('Nothing to delete', true); return; }
    if(!confirm('Delete the most recently logged session? This cannot be undone.')) return;
    Store.deleteLastSession();
    renderSetup();
    toast('Last session deleted');
  };
}

/* =====================================================================
   ROUTER + STATIC WIRING
   ===================================================================== */
function setTab(tab){
  state.tab = tab;
  document.getElementById('view-log').hidden = tab !== 'log';
  document.getElementById('view-progress').hidden = tab !== 'progress';
  document.getElementById('view-setup').hidden = tab !== 'setup';
  document.querySelectorAll('[data-tab]').forEach(b =>
    b.setAttribute('aria-pressed', b.dataset.tab === tab));
  if(tab === 'log') renderLog();
  else if(tab === 'progress') renderProgress();
  else if(tab === 'setup') renderSetup();
  window.scrollTo(0, 0);
}

function syncChips(){
  document.querySelectorAll('[data-week]').forEach(b => b.setAttribute('aria-pressed', b.dataset.week===state.week));
  document.querySelectorAll('[data-day]').forEach(b => b.setAttribute('aria-pressed', b.dataset.day===state.day));
}

function wireStatic(){
  document.querySelectorAll('[data-week]').forEach(b => b.onclick = () => { state.week = b.dataset.week; renderLog(); });
  document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { state.day = b.dataset.day; renderLog(); });
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  document.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { state.range = b.dataset.range; renderProgress(); });
  document.getElementById('logbtn').onclick = doLog;
  document.getElementById('reset').onclick = () => {
    ORDER.forEach(key => { const sk = setKeyOf(key); if(sk in state.sets) state.sets[sk] = 0; });
    renderLog();
  };
}

/* ---------------- Boot ---------------- */
async function boot(){
  await Store.load();
  installFlushOnPause();
  state.day = autoPickDay();
  wireStatic();
  setTab('log');
  if(isNative()){
    // dark app -> light status-bar content, no white splash flash
    if(Cap.Plugins.StatusBar){ try{ Cap.Plugins.StatusBar.setStyle({ style: 'DARK' }); }catch{} }
    const KB = Cap.Plugins.Keyboard;
    if(KB){
      // number pads have no return key -> show the accessory bar's Done button
      try{ KB.setAccessoryBarVisible({ isVisible: true }); }catch{}
      const wrap = document.querySelector('.wrap');
      // resize mode is "none" (capacitor.config) so the tab bar stays put behind the
      // keyboard instead of jumping up; we extend the scroll area by the keyboard height
      // and bring the focused field into view so it's never hidden.
      KB.addListener('keyboardWillShow', info => {
        if(wrap) wrap.style.paddingBottom = ((info.keyboardHeight || 300) + 24) + 'px';
        const a = document.activeElement;
        if(a && a.scrollIntoView) setTimeout(() => a.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
      });
      KB.addListener('keyboardWillHide', () => { if(wrap) wrap.style.paddingBottom = ''; });
    }
  }

  // A genuine TAP (not a scroll) outside a focused input dismisses the keyboard.
  // Tracking movement is essential: without it, the touchend at the end of a scroll
  // gesture would blur the input and close the keyboard mid-scroll.
  let touchStartY = 0;
  document.addEventListener('touchstart', e => {
    touchStartY = e.touches[0] ? e.touches[0].clientY : 0;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    const a = document.activeElement;
    if(!(a && a.tagName === 'INPUT')) return;
    const endY = e.changedTouches[0] ? e.changedTouches[0].clientY : 0;
    if(Math.abs(endY - touchStartY) < 10 && !e.target.closest('input')) a.blur();
  }, { passive: true });
}
boot();
