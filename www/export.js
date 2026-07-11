/* ---------------- Export the workout log as JSON ----------------
   Native: write a dated .json into the Cache dir, then open the iOS share sheet
   (AirDrop / Files / Mail / etc.). Web dev: trigger a Blob download. */

import { isNative } from './store.js';

const Cap = typeof window !== 'undefined' ? window.Capacitor : undefined;

function dateStamp(){
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

/* payload: the object to serialize (settings + sessions). */
export async function exportJSON(payload){
  const json = JSON.stringify(payload, null, 2);
  const filename = `workout-log-${dateStamp()}.json`;

  if(isNative()){
    const { Filesystem, Share } = Cap.Plugins;
    // Encoding must be UTF8 or Filesystem expects base64 and mangles the text.
    const res = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: 'CACHE',        // regenerate-on-demand; system may reclaim later
      encoding: 'utf8'
    });
    // Share the file itself (files-only; mixing text/url confuses some targets).
    await Share.share({
      title: 'Workout log',
      dialogTitle: 'Export workout log',
      files: [res.uri]
    });
    return { ok: true, filename };
  }

  // ---- web dev fallback: download via object URL ----
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, filename };
}
