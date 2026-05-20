'use strict';

const cfg = window.PersonioConfig;

const DEFAULT_SCHEDULE = {
  workday_start: '09:00',
  workday_end: '18:00',
  break_minutes: 60
};

const ACCOUNT_KEYS = ['personio_subdomain', 'employee_id'];

const els = {
  personioSubdomain: document.getElementById('personio-subdomain'),
  employeeId: document.getElementById('employee-id'),
  workdayStart: document.getElementById('workday-start'),
  workdayEnd: document.getElementById('workday-end'),
  breakMinutes: document.getElementById('break-minutes'),
  saveSettings: document.getElementById('save-settings'),
  autoFill: document.getElementById('auto-fill'),
  revertDay: document.getElementById('revert-day'),
  revertDayBtn: document.getElementById('revert-day-btn'),
  status: document.getElementById('status')
};

function setStatus(message) {
  els.status.textContent = message || 'Ready.';
}

function firstDayOfCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function readFormAccount() {
  const subdomainRaw = els.personioSubdomain.value.trim();
  const employeeRaw = els.employeeId.value.trim();
  const parsed = cfg.parseAccountFromPastedText(subdomainRaw);

  if (parsed) {
    return {
      personio_subdomain: parsed.personio_subdomain || subdomainRaw,
      employee_id: employeeRaw || parsed.employee_id || ''
    };
  }

  return {
    personio_subdomain: subdomainRaw,
    employee_id: employeeRaw
  };
}

function readFormSchedule() {
  return {
    workday_start: els.workdayStart.value || DEFAULT_SCHEDULE.workday_start,
    workday_end: els.workdayEnd.value || DEFAULT_SCHEDULE.workday_end,
    break_minutes: Number(els.breakMinutes.value || DEFAULT_SCHEDULE.break_minutes)
  };
}

async function getSettings() {
  const [local, sync] = await Promise.all([
    chrome.storage.local.get({ personio_subdomain: '', employee_id: '' }),
    chrome.storage.sync.get(DEFAULT_SCHEDULE)
  ]);
  return {
    personio_subdomain: local.personio_subdomain || '',
    employee_id: local.employee_id || '',
    workday_start: sync.workday_start || DEFAULT_SCHEDULE.workday_start,
    workday_end: sync.workday_end || DEFAULT_SCHEDULE.workday_end,
    break_minutes: Number(sync.break_minutes ?? DEFAULT_SCHEDULE.break_minutes)
  };
}

function buildAttendanceUrl(settings, startDate) {
  const account = cfg.validateAccountSettings(settings);
  return cfg.buildAttendanceUrl(account.personio_subdomain, account.employee_id, startDate);
}

function isAttendanceUrl(url, settings) {
  return cfg.isAttendanceUrl(url, settings);
}

function hasExpectedMonth(url) {
  return cfg.hasExpectedMonth(url, firstDayOfCurrentMonth());
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Optional host permissions must be requested from the popup (user gesture).
 * chrome.permissions.request in the service worker returns false without a prompt.
 */
async function ensureHostPermission(subdomain) {
  const sub = cfg.normalizeSubdomain(subdomain);
  if (!sub) {
    throw new Error('Personio company subdomain is required.');
  }
  const origin = cfg.buildOriginPattern(sub);

  if (await chrome.permissions.contains({ origins: [origin] })) {
    await chrome.runtime.sendMessage({
      command: 'REVOKE_OTHER_PERSONIO_ORIGINS',
      keepOrigin: origin
    });
    return;
  }

  const ok = await chrome.permissions.request({ origins: [origin] });
  if (!ok) {
    throw new Error(
      'Host permission was not granted. Click Save again and choose Allow when Chrome asks to access your Personio company site.'
    );
  }

  await chrome.runtime.sendMessage({
    command: 'REVOKE_OTHER_PERSONIO_ORIGINS',
    keepOrigin: origin
  });
}

async function reregisterContentScripts() {
  await chrome.runtime.sendMessage({ command: 'REREGISTER_CONTENT_SCRIPTS' });
}

async function ensureAttendanceTab(tab, settings) {
  if (!tab || !tab.id) {
    throw new Error('No active tab found.');
  }

  const startDate = firstDayOfCurrentMonth();
  if (!tab.url || !isAttendanceUrl(tab.url, settings) || !hasExpectedMonth(tab.url)) {
    const url = buildAttendanceUrl(settings, startDate);
    await chrome.tabs.update(tab.id, { url });
    await new Promise((resolve) => {
      const listener = (updatedTabId, info) => {
        if (updatedTabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }
  return tab.id;
}

async function saveSettings() {
  const account = cfg.validateAccountSettings(readFormAccount());
  const schedule = readFormSchedule();

  // Persist before permission prompt — the popup often closes when Chrome shows Allow/Deny.
  await chrome.storage.local.set(account);
  await chrome.storage.sync.set(schedule);
  await chrome.storage.sync.remove(ACCOUNT_KEYS);
  els.personioSubdomain.value = account.personio_subdomain;
  els.employeeId.value = account.employee_id;

  try {
    await ensureHostPermission(account.personio_subdomain);
    await reregisterContentScripts();
    setStatus('Settings saved. Reload the attendance tab if commands do not respond.');
  } catch (error) {
    setStatus(
      `Account saved. ${error.message} Reopen the popup and click Save again to finish.`
    );
  }
}

async function loadSettings() {
  const settings = await getSettings();
  els.personioSubdomain.value = settings.personio_subdomain;
  els.employeeId.value = settings.employee_id;
  els.workdayStart.value = settings.workday_start;
  els.workdayEnd.value = settings.workday_end;
  els.breakMinutes.value = String(settings.break_minutes);

  const sub = cfg.normalizeSubdomain(settings.personio_subdomain);
  if (sub && settings.employee_id) {
    const origin = cfg.buildOriginPattern(sub);
    const hasHost = await chrome.permissions.contains({ origins: [origin] });
    if (!hasHost) {
      setStatus('Account loaded. Click Save settings to allow access to your Personio site.');
    }
  }
}

function sendTabCommand(tabId, command, extra = {}) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { command, ...extra }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          message: `${chrome.runtime.lastError.message} — save settings and reload the attendance page.`
        });
        return;
      }
      resolve(response || { ok: false, message: 'No response from content script.' });
    });
  });
}

function parseRevertDay() {
  const day = Number(els.revertDay.value);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('Enter a day of month between 1 and 31.');
  }
  return day;
}

async function runCommand(command, extra = {}) {
  try {
    setStatus('Running...');
    const settings = await getSettings();
    cfg.validateAccountSettings(settings);
    await ensureHostPermission(settings.personio_subdomain);

    const tab = await getActiveTab();
    const tabId = await ensureAttendanceTab(tab, settings);
    const result = await sendTabCommand(tabId, command, extra);
    if (!result.ok) {
      throw new Error(result.message || 'Command failed');
    }
    const lines = [];
    if (result.summary) lines.push(result.summary);
    if (Array.isArray(result.logs) && result.logs.length) {
      lines.push('');
      lines.push(result.logs.join('\n'));
    }
    setStatus(lines.join('\n'));
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
}

els.saveSettings.addEventListener('click', () => {
  saveSettings().catch((error) => setStatus(`Error: ${error.message}`));
});

els.autoFill.addEventListener('click', () => {
  runCommand('AUTO_FILL');
});

els.revertDayBtn.addEventListener('click', () => {
  const dayNumber = parseRevertDay();
  const ok = window.confirm(
    `Clear all time entries for day ${dayNumber}?\n\nThis deletes periods and saves — cannot be undone from the extension.`
  );
  if (!ok) return;
  runCommand('REVERT_DAY', { dayNumber });
});

loadSettings()
  .then(() => {
    els.revertDay.value = String(new Date().getDate());
  })
  .catch((error) => setStatus(`Error: ${error.message}`));
