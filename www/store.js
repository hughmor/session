/* ---------------- Durable store ----------------
   The "must-not-lose-it" guarantee lives here.

   Native (iOS): @capacitor/preferences -> UserDefaults (survives WebKit storage
   eviction, included in device/iCloud backup). Reached through the Capacitor
   bridge global (Capacitor.Plugins.Preferences) so we need no bundler.
   Web (desktop dev only): localStorage.

   Everything is loaded into memory once at boot; mutations write through with a
   short debounce, and we force-flush when the app backgrounds so a kill can't
   drop the last change. */

const Cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
export const isNative = () => !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());

const SETTINGS_KEY = 'settings';
const SESSIONS_KEY = 'sessions';
const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  schemaVersion: SCHEMA_VERSION,
  unit: 'kg',
  incrementKg: 5,          // canonical kg; +5 kg default per progression
  bodyweightKg: null,
  goals: { push: 1.0, press: 0.65, squat: 1.5, hinge: 2.0 }, // bodyweight multiples
  pullupGoalReps: 12
};

/* ---- low-level async get/set (native Preferences or localStorage) ---- */
async function rawGet(key){
  if(isNative()){
    const { value } = await Cap.Plugins.Preferences.get({ key });
    return value ?? null;
  }
  try { return localStorage.getItem(key); } catch { return null; }
}
async function rawSet(key, value){
  if(isNative()){
    await Cap.Plugins.Preferences.set({ key, value });
    return;
  }
  try { localStorage.setItem(key, value); } catch { /* dev fallback: ignore quota */ }
}

/* ---- in-memory cache + debounced write-through ---- */
let cache = { settings: null, sessions: null };
const dirty = new Set();
let flushTimer = null;

function scheduleFlush(){
  if(flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 200);
}

export async function flush(){
  if(flushTimer){ clearTimeout(flushTimer); flushTimer = null; }
  const writes = [];
  if(dirty.has(SETTINGS_KEY)) writes.push(rawSet(SETTINGS_KEY, JSON.stringify(cache.settings)));
  if(dirty.has(SESSIONS_KEY)) writes.push(rawSet(SESSIONS_KEY, JSON.stringify(cache.sessions)));
  dirty.clear();
  await Promise.all(writes);
}

/* Merge stored settings over defaults so new fields always exist (cheap migration). */
function normalizeSettings(stored){
  const s = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  s.goals = { ...DEFAULT_SETTINGS.goals, ...((stored && stored.goals) || {}) };
  s.schemaVersion = SCHEMA_VERSION;
  return s;
}

export const Store = {
  async load(){
    const [rawSettings, rawSessions] = await Promise.all([
      rawGet(SETTINGS_KEY), rawGet(SESSIONS_KEY)
    ]);
    let parsedSettings = null, parsedSessions = null;
    try { parsedSettings = rawSettings ? JSON.parse(rawSettings) : null; } catch {}
    try { parsedSessions = rawSessions ? JSON.parse(rawSessions) : null; } catch {}
    cache.settings = normalizeSettings(parsedSettings);
    cache.sessions = Array.isArray(parsedSessions) ? parsedSessions : [];
    // persist normalized settings if we filled in defaults for the first time
    if(!rawSettings){ dirty.add(SETTINGS_KEY); scheduleFlush(); }
    return { settings: cache.settings, sessions: cache.sessions };
  },

  get settings(){ return cache.settings; },
  get sessions(){ return cache.sessions; },

  saveSettings(patch){
    const next = { ...cache.settings, ...patch };
    // goals is nested: merge over the CURRENT goals, not the defaults, so editing
    // one goal never resets the others.
    if(patch && patch.goals){
      next.goals = { ...cache.settings.goals, ...patch.goals };
    }
    cache.settings = normalizeSettings(next);
    dirty.add(SETTINGS_KEY);
    scheduleFlush();
    return cache.settings;
  },

  appendSession(session){
    cache.sessions.push(session);
    dirty.add(SESSIONS_KEY);
    scheduleFlush();
    return session;
  },

  deleteLastSession(){
    const removed = cache.sessions.pop() || null;
    dirty.add(SESSIONS_KEY);
    scheduleFlush();
    return removed;
  },

  /* Replace the dataset from an imported JSON object. Accepts either a bare
     sessions array or an export blob { settings?, sessions }. Returns the number
     of sessions loaded; throws if the shape is unrecognizable. */
  importData(data){
    if(Array.isArray(data)) data = { sessions: data };
    if(!data || typeof data !== 'object' || !Array.isArray(data.sessions)){
      throw new Error('Unrecognized file: expected a workout log with a "sessions" array.');
    }
    cache.sessions = data.sessions;
    dirty.add(SESSIONS_KEY);
    if(data.settings && typeof data.settings === 'object'){
      cache.settings = normalizeSettings(data.settings);
      dirty.add(SETTINGS_KEY);
    }
    scheduleFlush();
    return cache.sessions.length;
  }
};

/* Flush pending writes when the app is backgrounded or the page is hidden. */
export function installFlushOnPause(){
  if(isNative() && Cap.Plugins.App && Cap.Plugins.App.addListener){
    Cap.Plugins.App.addListener('appStateChange', ({ isActive }) => { if(!isActive) flush(); });
  }
  if(typeof document !== 'undefined'){
    document.addEventListener('visibilitychange', () => { if(document.hidden) flush(); });
    window.addEventListener('pagehide', () => { flush(); });
  }
}
