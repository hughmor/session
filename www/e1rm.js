/* ---------------- Estimated 1-rep-max + regression ----------------
   Pure math, no DOM, no storage. Everything here works in canonical kg. */

/* Brzycki's 36/(37-r) denominator explodes as r -> 37 and the formula is only
   validated to ~10 reps, so clamp reps into a sane range before estimating. */
const REP_MIN = 1;
const REP_MAX = 12;

export function clampReps(r){
  return Math.max(REP_MIN, Math.min(REP_MAX, r));
}

export function epley(weightKg, reps){
  const r = clampReps(reps);
  return weightKg * (1 + r/30);
}

export function brzycki(weightKg, reps){
  const r = clampReps(reps);
  return weightKg * 36 / (37 - r);
}

/* The estimate the app uses: the mean of Epley and Brzycki (they err in opposite
   directions, so the average is a reasonable central estimate for 1-10 reps). */
export function e1rm(weightKg, reps){
  if(!(weightKg > 0) || !(reps >= 1)) return null;
  return (epley(weightKg, reps) + brzycki(weightKg, reps)) / 2;
}

/* Least-squares linear regression over [{x,y}, ...].
   Returns {slope, intercept} or null when a line is undefined
   (fewer than 2 points, or every x identical -> vertical/degenerate). */
export function linearRegression(points){
  const n = points.length;
  if(n < 2) return null;
  let sx=0, sy=0, sxx=0, sxy=0;
  for(const p of points){ sx+=p.x; sy+=p.y; sxx+=p.x*p.x; sxy+=p.x*p.y; }
  const denom = n*sxx - sx*sx;
  if(denom === 0) return null;               // all x equal
  const slope = (n*sxy - sx*sy) / denom;
  const intercept = (sy - slope*sx) / n;
  return { slope, intercept };
}
