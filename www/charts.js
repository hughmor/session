/* ---------------- Progress charts ----------------
   Hand-rolled inline SVG (no CDN, offline-safe), one single-series scatter per
   primary. Follows the dataviz method: single series => no legend (the title
   names it), one axis, recessive grid/axes, markers >=8px, 2px lines, all text in
   ink tokens (colored marks carry identity). Colors map to the app palette:
     points  -> --primary (lime)    trend -> --ink @ .45    goal -> --secondary (dashed) */

import { linearRegression } from './e1rm.js';

const VB_W = 340, VB_H = 210;
const M = { l: 40, r: 14, t: 12, b: 28 };
const PLOT_W = VB_W - M.l - M.r;
const PLOT_H = VB_H - M.t - M.b;

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const round = (n, d=0) => { const f = 10**d; return Math.round(n*f)/f; };

function niceTicks(min, max, count){
  if(min === max){ return [min]; }
  const span = max - min;
  const step = span / count;
  const mag = 10 ** Math.floor(Math.log10(step));
  const norm = step / mag;
  const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  const s = nice * mag;
  const start = Math.ceil(min / s) * s;
  const ticks = [];
  for(let v = start; v <= max + 1e-9; v += s) ticks.push(round(v, 2));
  return ticks;
}

function shortDate(ms){
  const d = new Date(ms);
  return `${d.getMonth()+1}/${d.getDate()}`;
}

/* opts: { title, subtitle, unit, mode:'weight'|'reps', points:[{t,y}], goal:number|null }
   Returns an HTML string for one chart card body. */
export function renderChart(opts){
  const { title, subtitle, points, goal } = opts;
  const head = `<div class="chart-head">
      <div class="chart-title">${esc(title)}</div>
      ${subtitle ? `<div class="chart-sub">${esc(subtitle)}</div>` : ''}
    </div>`;

  if(!points.length){
    return `<section class="card chart-card">${head}
      <div class="chart-empty">No data yet — log a ${esc(title)} session to start this plot.</div>
    </section>`;
  }

  // ----- domains (include goal in y so the goal line is always on-canvas) -----
  const ts = points.map(p => p.t);
  let tMin = Math.min(...ts), tMax = Math.max(...ts);
  if(tMin === tMax){ tMin -= 86400000; tMax += 86400000; } // single day -> pad ±1d
  const ys = points.map(p => p.y);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  if(goal != null){ yMin = Math.min(yMin, goal); yMax = Math.max(yMax, goal); }
  if(yMin === yMax){ yMin -= 1; yMax += 1; }
  const yPad = (yMax - yMin) * 0.12;
  yMin -= yPad; yMax += yPad;
  if(opts.mode === 'reps') yMin = Math.max(0, yMin);

  const sx = t => M.l + (t - tMin) / (tMax - tMin) * PLOT_W;
  const sy = y => M.t + (1 - (y - yMin) / (yMax - yMin)) * PLOT_H;

  // ----- grid + y ticks -----
  const yTicks = niceTicks(yMin, yMax, 4);
  const gridEls = yTicks.map(v => {
    const y = sy(v);
    return `<line class="grid" x1="${M.l}" y1="${round(y,1)}" x2="${VB_W-M.r}" y2="${round(y,1)}"/>
      <text class="ytick" x="${M.l-6}" y="${round(y+3,1)}" text-anchor="end">${round(v, opts.mode==='reps'?0:1)}</text>`;
  }).join('');

  // ----- x ticks (first, last, and up to 2 interior) -----
  const xVals = [tMin, tMin+(tMax-tMin)/3, tMin+2*(tMax-tMin)/3, tMax];
  const xEls = xVals.map((t,i) => {
    const anchor = i===0 ? 'start' : i===xVals.length-1 ? 'end' : 'middle';
    return `<text class="xtick" x="${round(sx(t),1)}" y="${VB_H-8}" text-anchor="${anchor}">${shortDate(t)}</text>`;
  }).join('');

  // ----- goal line (dashed) + label -----
  let goalEls = '';
  if(goal != null){
    const gy = round(sy(goal),1);
    goalEls = `<line class="goal" x1="${M.l}" y1="${gy}" x2="${VB_W-M.r}" y2="${gy}"/>
      <text class="goal-lab" x="${VB_W-M.r}" y="${round(gy-5,1)}" text-anchor="end">GOAL ${round(goal, opts.mode==='reps'?0:1)}</text>`;
  }

  // ----- least-squares trend (skip <2 pts or all-equal x) -----
  let trendEls = '';
  const reg = linearRegression(points.map(p => ({ x: p.t, y: p.y })));
  if(reg){
    const y1 = reg.slope*tMin + reg.intercept;
    const y2 = reg.slope*tMax + reg.intercept;
    trendEls = `<line class="trend" x1="${M.l}" y1="${round(sy(y1),1)}" x2="${VB_W-M.r}" y2="${round(sy(y2),1)}"/>`;
  }

  // ----- points -----
  const dots = points.map(p =>
    `<circle class="pt" cx="${round(sx(p.t),1)}" cy="${round(sy(p.y),1)}" r="4.5"/>`
  ).join('');

  const a11y = `${title}: ${points.length} point${points.length>1?'s':''}` +
    (goal!=null ? `, goal ${round(goal,1)}` : '');

  return `<section class="card chart-card">${head}
    <svg class="chart" viewBox="0 0 ${VB_W} ${VB_H}" role="img" aria-label="${esc(a11y)}" preserveAspectRatio="xMidYMid meet">
      <line class="axis" x1="${M.l}" y1="${M.t}" x2="${M.l}" y2="${M.t+PLOT_H}"/>
      <line class="axis" x1="${M.l}" y1="${M.t+PLOT_H}" x2="${VB_W-M.r}" y2="${M.t+PLOT_H}"/>
      ${gridEls}${xEls}${goalEls}${trendEls}${dots}
    </svg>
  </section>`;
}
