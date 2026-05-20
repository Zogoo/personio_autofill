'use strict';

importScripts('../src/personio-config.js');

const cfg = self.PersonioConfig;
const CONTENT_SCRIPT_ID = 'personio-attendance-scripts';
const ALLOWED_COMMANDS = new Set([
  'ENSURE_HOST_PERMISSION',
  'REVOKE_OTHER_PERSONIO_ORIGINS',
  'REREGISTER_CONTENT_SCRIPTS'
]);

const SCRIPT_FILES = [
  'src/personio-config.js',
  'src/safety.js',
  'src/time-model.js',
  'src/spin-fill.js',
  'src/personio-dom.js',
  'src/time-entry-fill.js',
  'src/content-script.js'
];

const ACCOUNT_KEYS = ['personio_subdomain', 'employee_id'];

function isExtensionSender(sender) {
  return sender?.id === chrome.runtime.id;
}

function buildMatchPattern(subdomain) {
  const sub = cfg.normalizeSubdomain(subdomain);
  if (!sub) return null;
  return `https://${cfg.buildHostname(sub)}/attendance/employee/*`;
}

async function unregisterContentScripts() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  } catch (_err) {
    /* not registered */
  }
}

async function registerContentScripts(subdomain) {
  const match = buildMatchPattern(subdomain);
  await unregisterContentScripts();
  if (!match) return;

  await chrome.scripting.registerContentScripts([{
    id: CONTENT_SCRIPT_ID,
    matches: [match],
    js: SCRIPT_FILES,
    runAt: 'document_idle'
  }]);
}

async function readAccountFromStorage() {
  const local = await chrome.storage.local.get({
    personio_subdomain: '',
    employee_id: ''
  });
  return local;
}

/** One-time migration: account fields moved from sync → local. */
async function migrateAccountSettingsToLocal() {
  const [local, sync] = await Promise.all([
    chrome.storage.local.get({ personio_subdomain: '', employee_id: '' }),
    chrome.storage.sync.get({ personio_subdomain: '', employee_id: '' })
  ]);

  const patch = {};
  if (!local.personio_subdomain && sync.personio_subdomain) {
    patch.personio_subdomain = sync.personio_subdomain;
  }
  if (!local.employee_id && sync.employee_id) {
    patch.employee_id = sync.employee_id;
  }
  if (Object.keys(patch).length) {
    await chrome.storage.local.set(patch);
    await chrome.storage.sync.remove(ACCOUNT_KEYS);
  }
}

async function syncContentScriptsFromStorage() {
  const { personio_subdomain: subdomain } = await readAccountFromStorage();
  await registerContentScripts(subdomain);
}

/**
 * Request host access only for the configured tenant (not the full *.personio wildcard).
 * @param {string} subdomain
 */
async function ensureHostPermissionForSubdomain(subdomain) {
  const sub = cfg.normalizeSubdomain(subdomain);
  if (!sub) {
    throw new Error('Personio company subdomain is required.');
  }
  const origin = cfg.buildOriginPattern(sub);

  const granted = await chrome.permissions.contains({ origins: [origin] });
  if (granted) {
    await revokeOtherPersonioOrigins(origin);
    return true;
  }

  const ok = await chrome.permissions.request({ origins: [origin] });
  if (ok) {
    await revokeOtherPersonioOrigins(origin);
  }
  return ok;
}

/** Drop other *.app.personio.com origins when the user switches company subdomain. */
async function revokeOtherPersonioOrigins(keepOrigin) {
  const all = await chrome.permissions.getAll();
  const toRemove = (all.origins || []).filter((origin) => {
    return origin.includes('.app.personio.com/') && origin !== keepOrigin;
  });
  if (toRemove.length) {
    await chrome.permissions.remove({ origins: toRemove });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await migrateAccountSettingsToLocal();
  await syncContentScriptsFromStorage();
});

chrome.runtime.onStartup.addListener(() => {
  syncContentScriptsFromStorage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.personio_subdomain) {
    syncContentScriptsFromStorage();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isExtensionSender(sender)) {
    return false;
  }
  if (!ALLOWED_COMMANDS.has(message?.command)) {
    return false;
  }

  if (message.command === 'ENSURE_HOST_PERMISSION') {
    const sub = message.subdomain || '';
    ensureHostPermissionForSubdomain(sub)
      .then((granted) => sendResponse({ ok: granted }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.command === 'REVOKE_OTHER_PERSONIO_ORIGINS') {
    revokeOtherPersonioOrigins(message.keepOrigin || '')
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.command === 'REREGISTER_CONTENT_SCRIPTS') {
    syncContentScriptsFromStorage()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  return false;
});
