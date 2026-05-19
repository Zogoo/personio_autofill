#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outPath = path.join(__dirname, 'browser-main-feature-pretest.bundle.js');

const parts = [
  'src/personio-config.js',
  'src/safety.js',
  'src/time-model.js',
  'src/spin-fill.js',
  'src/personio-dom.js',
  'src/time-entry-fill.js',
  'tests/console-pretest-runner.js'
];

const banner = `/**
 * AUTO-GENERATED — run: npm run pretest:build
 * Paste entire file into DevTools Console on Personio Attendance monthly page.
 */
`;

let body = '';
for (const rel of parts) {
  const filePath = path.join(root, rel);
  body += `\n/* --- ${rel} --- */\n`;
  body += fs.readFileSync(filePath, 'utf8');
  body += '\n';
}

const bundleContent = banner + body;
fs.writeFileSync(outPath, bundleContent, 'utf8');
console.log(`Wrote ${outPath} (${(Buffer.byteLength(bundleContent) / 1024).toFixed(1)} KB)`);