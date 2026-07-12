# Session — Workout Tracker

A dark, minimal iOS workout tracker: log each session, auto-suggest weights via linear progression, and chart estimated 1RM over time. Built as a web app
(`www/`) wrapped in a native iOS shell with [Capacitor](https://capacitorjs.com).

## Develop

All app code lives in **`www/`** (plain HTML/CSS/JS, no build step).

**Quick preview in a browser** (uses localStorage; native storage/share are stubbed):
```
cd www && python3 -m http.server 8000   # open http://localhost:8000
```

**Run on device/simulator:**
```
npx cap sync ios     # copy www/ + config into the native project
npx cap open ios     # then press ▶ Run in Xcode
```
Edit `www/` → `npx cap sync ios` → Run. Don't edit `ios/App/App/public/` (it's a generated copy).

## Fresh clone

The copied web assets are gitignored, so run this **before** building:
```
npm install
npx cap sync ios
```

## Features to implement
- Tracking week A/B
- More exercises in some secondary categories
- Tap on a category to expand into a full page view with warm-up
- Workout reminder push notifications
- Customizable workout schedule and split
- Customizable sets*reps targets (program level)
- Built-in timers
- Need better progression metric for rep-based bodyweight movements that will turn into weight-added (weight*rep FoM?)
- Spreadsheet export
- Connection to self-hosted database for log backup + visualization + analytics
