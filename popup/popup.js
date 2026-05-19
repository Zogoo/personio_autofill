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
  return {
    personio_subdomain: els.personioSubdomain.value,
    employee_id: els.employeeId.value.trim()
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

async function ensureHostPermission(subdomain) {
  const response = await chrome.runtime.sendMessage({
    command: 'ENSURE_HOST_PERMISSION',
    subdomain
  });
  if (!response?.ok) {
    throw new Error('Host permission for your Personio company was not granted.');
  }
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
  const account = readFormAccount();
  const schedule = readFormSchedule();
  cfg.validateAccountSettings(account);

  await ensureHostPermission(account.personio_subdomain);
  await chrome.storage.local.set(account);
  await chrome.storage.sync.set(schedule);
  await chrome.storage.sync.remove(ACCOUNT_KEYS);
  await reregisterContentScripts();
  setStatus('Settings saved. Reload the attendance tab if commands do not respond.');
}

async function loadSettings() {
  const settings = await getSettings();
  els.personioSubdomain.value = settings.personio_subdomain;
  els.employeeId.value = settings.employee_id;
  els.workdayStart.value = settings.workday_start;
  els.workdayEnd.value = settings.workday_end;
  els.breakMinutes.value = String(settings.break_minutes);
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
