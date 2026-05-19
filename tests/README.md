# Manual pretest (DevTools)

Same logic as the extension (`src/` + popup flow), runnable in the browser console before you ship changes.

## Build

```bash
npm run pretest:build
```

Regenerates `browser-main-feature-pretest.bundle.js` from `src/safety.js`, `src/time-model.js`, `src/personio-dom.js`, and `console-pretest-runner.js`.

## Run on Personio

1. Open your company monthly attendance page, e.g.  
   `https://YOUR-COMPANY.app.personio.com/attendance/employee/EMPLOYEE_ID?viewMode=monthly&startDate=YYYY-MM-01`
2. DevTools → Console → paste the **entire** `browser-main-feature-pretest.bundle.js`.
3. Run the main flow:

```js
// Detect unfilled days (0h tracked, editable) → fill each → verify
await PersonioMainPretest.run()

// Detect only, no fill
await PersonioMainPretest.run({ dryRun: true })

// Limit to specific days
await PersonioMainPretest.run({ days: [15, 16] })
```

Other helpers:

```js
await PersonioMainPretest.detectUnfilledDays({ highlight: true })
await PersonioMainPretest.fillDay(15)
await PersonioMainPretest.runScan({ highlight: true })
```

Do not `fetch('http://127.0.0.1:...')` — Personio CSP blocks localhost.

If the page shows the **Refresh** empty state, detect/fill helpers click Refresh and wait for the grid automatically.

## Unit tests

```bash
npm test
```

Runs `test/*.spec.js` (DOM/time-model only, no browser).
