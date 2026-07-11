/* ---------------- Units + progressive-overload seeding ----------------
   Pure functions, no DOM, no storage. Canonical unit is ALWAYS kg; the display
   unit (kg/lb) is a pure presentation concern, so switching units can never
   corrupt stored history or the progress plots. */

import { modeOf } from './data.js';

export const LB_PER_KG = 2.2046226218;

export const kgToLb = kg => kg * LB_PER_KG;
export const lbToKg = lb => lb / LB_PER_KG;

/* value entered in the display unit -> canonical kg (full precision, no rounding,
   so staying in one unit never accumulates drift). */
export function fromDisplay(value, unit){
  if(value == null || value === '' || isNaN(value)) return null;
  const v = Number(value);
  if(v < 0) return null;
  return unit === 'lb' ? lbToKg(v) : v;
}

/* canonical kg -> a clean number in the display unit for prefilling a box.
   kg rounds to the nearest 0.5; lb to the nearest 1. */
export function toDisplay(weightKg, unit){
  if(weightKg == null) return null;
  if(unit === 'lb') return Math.round(kgToLb(weightKg));
  return Math.round(weightKg * 2) / 2;
}

/* Trim a display number to a tidy string ("52.5", "110", not "52.50"/"110.0"). */
export function fmt(n){
  if(n == null || isNaN(n)) return '';
  return String(Number(n));
}

/* Did this logged primary entry earn a progression?
   Rule: every prescribed set completed AND the AMRAP set beat 5 reps (>5). */
export function progressed(entry){
  return entry
    && entry.setsCompleted >= entry.setsPrescribed
    && entry.amrap != null
    && entry.amrap > 5;
}

/* Most recent logged entry (searching newest-first, across BOTH weeks and all
   days) matching a predicate. `sessions` is assumed oldest-first. */
function findLatest(sessions, pred){
  for(let i = sessions.length - 1; i >= 0; i--){
    const s = sessions[i];
    for(const ex of s.exercises){
      if(pred(ex, s)) return { ex, session: s };
    }
  }
  return null;
}

/* Recommended PRIMARY value for the next time `group` comes up.
   - weight groups: previous weightKg (+ incrementKg if progressed), else null
   - pull (reps):   previous target reps (+1 if progressed), else null
   - core (reps):   previous target reps held as-is (no auto-progression), else null
   Returns { mode, weightKg } or { mode, reps } or null when there's no history. */
export function seedPrimary(group, sessions, settings){
  const mode = modeOf(group, 'P');
  const key = mode === 'weight' ? 'weightKg' : 'reps';
  const found = findLatest(sessions, ex =>
    ex.group === group && ex.role === 'P' && ex[key] != null);
  if(!found) return null;

  const base = found.ex[key];
  const up = progressed(found.ex);
  if(mode === 'weight'){
    return { mode, weightKg: up ? base + settings.incrementKg : base };
  }
  // reps mode: pull progresses by +1 rep; core holds
  const stepped = (group === 'pull' && up) ? base + 1 : base;
  return { mode, reps: stepped };
}

/* Recommended SECONDARY value: simply the most recent logged value for that exact
   exercise label (no auto-increment for accessory work). */
export function seedSecondary(group, chosenLabel, sessions){
  const mode = modeOf(group, 'S');
  const key = mode === 'weight' ? 'weightKg' : 'reps';
  const found = findLatest(sessions, ex =>
    ex.group === group && ex.role === 'S' && ex.exercise === chosenLabel && ex[key] != null);
  if(!found) return null;
  return mode === 'weight'
    ? { mode, weightKg: found.ex[key] }
    : { mode, reps: found.ex[key] };
}
