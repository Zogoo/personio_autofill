/**
 * AUTO-GENERATED — run: npm run pretest:build
 * Paste entire file into DevTools Console on Personio Attendance monthly page.
 */

/* --- src/personio-config.js --- */
(function initPersonioConfig(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PersonioConfig = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function factory() {
  'use strict';

  const HOST_SUFFIX = '.app.personio.com';

  function normalizeSubdomain(value) {
    let input = String(value || '').trim().toLowerCase();
    if (!input) return '';

    try {
      if (input.includes('://') || input.includes('/')) {
        const href = input.includes('://') ? input : `https://${input}`;
        input = new URL(href).hostname;
      }
    } catch (_err) {
      /* keep raw input */
    }

    if (input.endsWith(HOST_SUFFIX)) {
      input = input.slice(0, -HOST_SUFFIX.length);
    }

    const hostParts = input.split('.');
    if (hostParts.length >= 3 && hostParts.slice(-2).join('.') === 'app.personio') {
      input = hostParts.slice(0, -2).join('.');
    }

    return input.replace(/[^a-z0-9-]/g, '');
  }

  function buildHostname(subdomain) {
    const sub = normalizeSubdomain(subdomain);
    if (!sub) {
      throw new Error('Personio company subdomain is required.');
    }
    return `${sub}${HOST_SUFFIX}`;
  }

  function buildOriginPattern(subdomain) {
    return `https://${buildHostname(subdomain)}/*`;
  }

  function buildAttendanceUrl(subdomain, employeeId, startDate) {
    const host = buildHostname(subdomain);
    const id = String(employeeId || '').trim();
    if (!/^\d+$/.test(id)) {
      throw new Error('Personio employee ID must be numeric.');
    }
    const params = new URLSearchParams({
      viewMode: 'monthly',
      startDate: startDate || ''
    });
    return `https://${host}/attendance/employee/${id}?${params.toString()}`;
  }

  function isPersonioAppHostname(hostname) {
    const host = String(hostname || '').toLowerCase();
    return host.endsWith(HOST_SUFFIX) && host.length > HOST_SUFFIX.length;
  }

  function isSecureHttpsUrl(url) {
    try {
      const parsed = typeof url === 'string' ? new URL(url) : url;
      return parsed.protocol === 'https:';
    } catch (_err) {
      return false;
    }
  }

  function hostnameMatchesSubdomain(hostname, subdomain) {
    const sub = normalizeSubdomain(subdomain);
    if (!sub) return isPersonioAppHostname(hostname);
    return String(hostname || '').toLowerCase() === buildHostname(sub);
  }

  function isAttendancePath(pathname) {
    return /^\/attendance\/employee\/\d+$/.test(pathname || '');
  }

  function isAttendanceUrl(url, config) {
    try {
      const parsed = typeof url === 'string' ? new URL(url) : url;
      if (!isSecureHttpsUrl(parsed) || !isPersonioAppHostname(parsed.hostname) ||
          !isAttendancePath(parsed.pathname)) {
        return false;
      }
      const sub = normalizeSubdomain(config?.personio_subdomain);
      if (sub && !hostnameMatchesSubdomain(parsed.hostname, sub)) return false;
      const employeeId = String(config?.employee_id || '').trim();
      if (employeeId && !parsed.pathname.endsWith(`/${employeeId}`)) return false;
      return true;
    } catch (_err) {
      return false;
    }
  }

  function hasExpectedMonth(url, startDate) {
    try {
      const parsed = typeof url === 'string' ? new URL(url) : url;
      return parsed.searchParams.get('viewMode') === 'monthly' &&
        parsed.searchParams.get('startDate') === startDate;
    } catch (_err) {
      return false;
    }
  }

  function assertAttendanceLocation(href, config) {
    const url = new URL(href);
    const isMonthly = url.searchParams.get('viewMode') === 'monthly';

    if (!isSecureHttpsUrl(url) || !isPersonioAppHostname(url.hostname) ||
        !isAttendancePath(url.pathname) || !isMonthly) {
      throw new Error('Blocked: command allowed only on Personio attendance monthly page.');
    }

    const sub = normalizeSubdomain(config?.personio_subdomain);
    if (sub && !hostnameMatchesSubdomain(url.hostname, sub)) {
      throw new Error(`Blocked: page host does not match configured subdomain "${sub}".`);
    }

    const employeeId = String(config?.employee_id || '').trim();
    if (employeeId && !url.pathname.endsWith(`/${employeeId}`)) {
      throw new Error('Blocked: page employee ID does not match configured employee ID.');
    }

    return true;
  }

  function validateAccountSettings(settings) {
    const sub = normalizeSubdomain(settings?.personio_subdomain);
    if (!sub) {
      throw new Error('Set your Personio company subdomain in settings (e.g. your-company).');
    }
    const employeeId = String(settings?.employee_id || '').trim();
    if (!/^\d+$/.test(employeeId)) {
      throw new Error('Set your Personio employee ID in settings (from the attendance URL).');
    }
    return { personio_subdomain: sub, employee_id: employeeId };
  }

  function subdomainFromHostname(hostname) {
    if (!isPersonioAppHostname(hostname)) return '';
    return hostname.slice(0, -HOST_SUFFIX.length);
  }

  return {
    HOST_SUFFIX,
    normalizeSubdomain,
    buildHostname,
    buildOriginPattern,
    buildAttendanceUrl,
    isPersonioAppHostname,
    isSecureHttpsUrl,
    hostnameMatchesSubdomain,
    isAttendancePath,
    isAttendanceUrl,
    hasExpectedMonth,
    assertAttendanceLocation,
    validateAccountSettings,
    subdomainFromHostname
  };
});


/* --- src/safety.js --- */
(function initSafety(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(root);
  } else {
    root.PersonioSafety = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function factory(root) {
  'use strict';

  function assertAttendanceLocation(href, config) {
    const cfg = root.PersonioConfig;
    if (cfg) return cfg.assertAttendanceLocation(href, config);

    const url = new URL(href);
    const isAttendancePath = /^\/attendance\/employee\/\d+$/.test(url.pathname);
    const isMonthly = url.searchParams.get('viewMode') === 'monthly';
    const isPersonioHost = /\.app\.personio\.com$/i.test(url.hostname);
    if (!isPersonioHost || !isAttendancePath || !isMonthly) {
      throw new Error('Blocked: command allowed only on Personio attendance monthly page.');
    }
    return true;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function poll(checkFn, options) {
    const timeoutMs = options.timeoutMs || 5000;
    const intervalMs = options.intervalMs || 125;
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      const value = checkFn();
      if (value) return value;
      await sleep(intervalMs);
    }
    return null;
  }

  function makeLogger() {
    const logs = [];
    return {
      push(line) {
        logs.push(String(line));
      },
      all() {
        return logs.slice();
      }
    };
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  return {
    assertAttendanceLocation,
    sleep,
    poll,
    makeLogger,
    normalizeText
  };
});


/* --- src/time-model.js --- */
(function initTimeModel(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PersonioTimeModel = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function factory() {
  'use strict';

  function parseTime(value) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
    if (!match) return null;
    return { hours: Number(match[1]), minutes: Number(match[2]) };
  }

  function toMinutes(time) {
    return (time.hours * 60) + time.minutes;
  }

  function fromMinutes(totalMinutes) {
    const minutesInDay = 24 * 60;
    const safe = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
    const hours = Math.floor(safe / 60);
    const minutes = safe % 60;
    return { hours, minutes };
  }

  function toTimeString(time) {
    return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
  }

  function derivePeriods(settings) {
    const start = parseTime(settings.workday_start);
    const end = parseTime(settings.workday_end);
    const breakMinutes = Number(settings.break_minutes);

    if (!start || !end || Number.isNaN(breakMinutes)) {
      throw new Error('Invalid settings values.');
    }
    if (breakMinutes < 0 || breakMinutes > 240) {
      throw new Error('Break minutes must be between 0 and 240.');
    }

    const startMinutes = toMinutes(start);
    const endMinutes = toMinutes(end);
    if (endMinutes <= startMinutes) {
      throw new Error('Workday end must be after workday start.');
    }

    const duration = endMinutes - startMinutes;
    if (duration <= breakMinutes) {
      throw new Error('Break is too long for selected workday range.');
    }

    const workDuration = duration - breakMinutes;
    const firstWorkDuration = Math.floor(workDuration / 2);
    const breakStartMinutes = startMinutes + firstWorkDuration;
    const breakEndMinutes = breakStartMinutes + breakMinutes;

    return [
      {
        type: 'Work',
        start: fromMinutes(startMinutes),
        end: fromMinutes(breakStartMinutes)
      },
      {
        type: 'Break',
        start: fromMinutes(breakStartMinutes),
        end: fromMinutes(breakEndMinutes)
      },
      {
        type: 'Work',
        start: fromMinutes(breakEndMinutes),
        end: fromMinutes(endMinutes)
      }
    ];
  }

  function validatePeriods(periods) {
    if (!Array.isArray(periods) || periods.length < 1) return false;
    for (let index = 0; index < periods.length; index += 1) {
      const period = periods[index];
      if (!period || !period.start || !period.end) return false;
      const start = toMinutes(period.start);
      const end = toMinutes(period.end);
      if (start >= end) return false;
      if (index > 0) {
        const previous = toMinutes(periods[index - 1].end);
        if (start < previous) return false;
      }
    }
    return true;
  }

  function toSpinFieldValues(periods) {
    return periods.flatMap((period) => [
      String(period.start.hours).padStart(2, '0'),
      String(period.start.minutes).padStart(2, '0'),
      String(period.end.hours).padStart(2, '0'),
      String(period.end.minutes).padStart(2, '0')
    ]);
  }

  function describePeriods(periods) {
    return periods.map((period) => (
      `${period.type} ${toTimeString(period.start)}-${toTimeString(period.end)}`
    ));
  }

  return {
    parseTime,
    toMinutes,
    fromMinutes,
    toTimeString,
    derivePeriods,
    validatePeriods,
    toSpinFieldValues,
    describePeriods
  };
});


/* --- src/spin-fill.js --- */
(function initSpinFill(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PersonioSpinFill = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function factory() {
  'use strict';

  function normalizedText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function editableTarget(field) {
    if (!field) return null;
    if (field.matches?.('input,textarea,[contenteditable="true"]')) return field;
    return field.querySelector?.('input,textarea,[contenteditable="true"]') || field;
  }

  function interactionTarget(field) {
    if (field?.getAttribute?.('role') === 'spinbutton') return field;
    return editableTarget(field) || field;
  }

  function readFieldValue(field) {
    if (!field) return '';
    for (const node of [field, editableTarget(field)]) {
      if (!node) continue;
      if ('value' in node && typeof node.value === 'string' && node.value !== '') return node.value;
      const aria = node.getAttribute?.('aria-valuenow');
      if (aria != null && aria !== '') return String(aria);
      const text = normalizedText(node.textContent);
      if (text) return text;
    }
    return '';
  }

  function digitsOnly(value) {
    return String(value || '').replace(/[^\d]/g, '');
  }

  function fieldPart(field, index) {
    const testId = (field.getAttribute?.('data-test-id') || '').toLowerCase();
    const label = (field.getAttribute?.('aria-label') || '').toLowerCase();
    if (/minute|min\b/.test(testId) || /\bminutes?\b/.test(label)) return 'minute';
    if (/hour|hr\b/.test(testId) || /\bhours?\b/.test(label)) return 'hour';
    return index % 2 === 0 ? 'hour' : 'minute';
  }

  function isFieldUnfilled(field) {
    const digits = digitsOnly(readFieldValue(field));
    return digits === '' || /^0+$/.test(digits);
  }

  function valuesMatch(field, expected, part) {
    const actualDigits = digitsOnly(readFieldValue(field));
    const want = digitsOnly(expected).padStart(2, '0').slice(-2);
    if (!actualDigits) return false;

    if (part === 'hour') {
      return Number(actualDigits.slice(0, 2)) === Number(want);
    }

    return Number(actualDigits.slice(-2)) === Number(want);
  }

  function dispatchInputEvents(element, data) {
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertFromPaste',
      data: data || ''
    }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setNativeValue(target, value) {
    if ('value' in target) {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      ) || Object.getOwnPropertyDescriptor(target.constructor.prototype, 'value');
      if (descriptor?.set) descriptor.set.call(target, value);
      else target.value = value;
      return;
    }
    if (target.isContentEditable) {
      target.textContent = String(value);
      return;
    }
    target.textContent = String(value);
  }

  function fireKey(target, type, key) {
    const code = key.length === 1 && /\d/.test(key) ? `Digit${key}` : key;
    target.dispatchEvent(new KeyboardEvent(type, {
      key,
      code,
      bubbles: true,
      cancelable: true
    }));
  }

  function selectAll(target) {
    if (target.select && typeof target.select === 'function') {
      target.select();
      return;
    }
    const isMac = navigator.platform.toLowerCase().includes('mac');
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'a',
      code: 'KeyA',
      bubbles: true,
      cancelable: true,
      ctrlKey: !isMac,
      metaKey: isMac
    }));
    try {
      document.execCommand('selectAll', false, null);
    } catch (_err) {
      // ignore
    }
  }

  function click(el) {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.click();
  }

  function commitField(target, sleep) {
    fireKey(target, 'keydown', 'Tab');
    fireKey(target, 'keyup', 'Tab');
    target.blur?.();
    return sleep(150);
  }

  async function focusField(field, sleep) {
    const target = interactionTarget(field);
    click(field);
    target.focus?.();
    await sleep(120);
    return target;
  }

  async function writeWithPaste(target, text, sleep) {
    selectAll(target);
    await sleep(40);
    fireKey(target, 'keydown', 'Backspace');
    fireKey(target, 'keyup', 'Backspace');
    await sleep(40);

    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch (_err) {
      inserted = false;
    }
    if (!inserted) setNativeValue(target, text);
    dispatchInputEvents(target, text);
    await sleep(80);
  }

  async function writeDigitsSequential(target, text, sleep) {
    selectAll(target);
    await sleep(40);
    fireKey(target, 'keydown', 'Backspace');
    fireKey(target, 'keyup', 'Backspace');
    await sleep(40);

    for (const char of text) {
      fireKey(target, 'keydown', char);
      fireKey(target, 'keypress', char);
      dispatchInputEvents(target, char);
      fireKey(target, 'keyup', char);
      await sleep(90);
    }
    await sleep(60);
  }

  async function writeWithArrows(field, target, sleep, part) {
    const want = Number(digitsOnly(target));
    const interact = interactionTarget(field);
    let current = Number(digitsOnly(readFieldValue(field)));
    if (Number.isNaN(current)) current = 0;

    const maxSteps = part === 'hour' ? 24 : 60;
    let steps = 0;

    while (current !== want && steps < maxSteps) {
      if (current < want) {
        fireKey(interact, 'keydown', 'ArrowUp');
        fireKey(interact, 'keyup', 'ArrowUp');
      } else {
        fireKey(interact, 'keydown', 'ArrowDown');
        fireKey(interact, 'keyup', 'ArrowDown');
      }
      await sleep(45);
      current = Number(digitsOnly(readFieldValue(field)));
      if (Number.isNaN(current)) current = 0;
      steps += 1;
    }
    await sleep(60);
  }

  async function writeFieldValue(field, value, sleep, part) {
    const text = digitsOnly(value).padStart(2, '0').slice(-2);
    const target = interactionTarget(field);
    if (!target) return false;

    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      setNativeValue(target, text);
      dispatchInputEvents(target, text);
      target.blur?.();
      await sleep(100);
      return valuesMatch(field, text, part);
    }

    await focusField(field, sleep);

    const strategies = [
      () => writeWithPaste(target, text, sleep),
      () => writeDigitsSequential(target, text, sleep),
      () => writeWithArrows(field, text, sleep, part)
    ];

    for (const strategy of strategies) {
      await focusField(field, sleep);
      await strategy();
      await commitField(target, sleep);
      if (valuesMatch(field, text, part)) return true;
    }

    return valuesMatch(field, text, part);
  }

  async function fillSpinFields(fields, values, options) {
    const sleep = options?.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const log = options?.log || (() => {});
    let filled = 0;

    const count = Math.min(fields.length, values.length);
    for (let index = 0; index < count; index += 1) {
      const field = fields[index];
      const value = values[index];
      const part = fieldPart(field, index);

      const force = options?.force === true;
      if (!force && !isFieldUnfilled(field) && valuesMatch(field, value, part)) {
        log(`Skip spin ${index + 1}/${count}: already ${readFieldValue(field)}`);
        continue;
      }

      const ok = await writeFieldValue(field, value, sleep, part);
      if (!ok) {
        throw new Error(
          `Spin ${index + 1}/${count} (${part}): could not set "${value}" (reads "${readFieldValue(field)}")`
        );
      }
      filled += 1;
      log(`Filled spin ${index + 1}/${count} (${part}) = ${value}`);
    }

    return filled;
  }

  function allFieldsZero(fields) {
    return fields.every((field) => isFieldUnfilled(field));
  }

  return {
    editableTarget,
    interactionTarget,
    readFieldValue,
    fieldPart,
    isFieldUnfilled,
    valuesMatch,
    writeFieldValue,
    fillSpinFields,
    allFieldsZero
  };
});


/* --- src/personio-dom.js --- */
(function initPersonioDom(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PersonioDom = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function factory() {
  'use strict';

  function normalizedText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeDateText(value) {
    return normalizedText(value).replace(/([A-Za-z])(\d)/g, '$1 $2');
  }

  function resolveRowRoot(startElement) {
    let node = startElement;
    while (node && node !== document.body) {
      if (node.getAttribute?.('data-test-id') === 'timesheet-timecard') return node;
      if (node.getAttribute?.('role') === 'row') return node;
      if (node.querySelector?.('[data-action-name="timesheet-day-options-button"]')) return node;
      if (node.querySelector?.('[aria-label^="Select "]')) return node;
      node = node.parentElement;
    }
    return null;
  }

  function parseDateLabel(text) {
    const cleaned = normalizeDateText(text);
    // Supports labels like "18 May", "Mon 18 May", "Monday 18 May".
    const match = /^(?:(?:[A-Za-z]+)\s+)?(\d{1,2})\s+([A-Za-z]+)$/.exec(cleaned);
    if (!match) return null;
    return {
      dayNumber: Number(match[1]),
      monthLabel: match[2],
      dayLabel: `${Number(match[1])} ${match[2]}`
    };
  }

  function parseDateFromMixedText(text) {
    const cleaned = normalizeDateText(text);
    // Supports row text like "Mon 18 May 0h/8h -8h" or "Tue 19 May 0h/8h".
    const match = /(?:^|\s)(\d{1,2})\s+([A-Za-z]+)(?:\s|$)/.exec(cleaned);
    if (!match) return null;
    return {
      dayNumber: Number(match[1]),
      monthLabel: match[2],
      dayLabel: `${Number(match[1])} ${match[2]}`
    };
  }

  function parseTrackedHours(rowRoot) {
    const cells = Array.from(rowRoot.querySelectorAll('[role="gridcell"], div, span'));
    for (const cell of cells) {
      const text = normalizedText(cell.textContent);
      const match = /^(\d+)h\s*\/\s*(\d+)h$/.exec(text);
      if (match) {
        return {
          current: Number(match[1]),
          expected: Number(match[2]),
          label: text
        };
      }
    }
    return null;
  }

  function extractStatus(rowRoot) {
    const enumNode = Array.from(rowRoot.querySelectorAll('span, div')).find((node) => {
      const text = normalizedText(node.textContent);
      return text === 'Approved' || text === 'Pending';
    });
    return enumNode ? normalizedText(enumNode.textContent) : '';
  }

  function findSelectionControl(rowRoot, dayLabel) {
    const selector = `[aria-label="Select ${dayLabel}"]`;
    const exact = rowRoot.querySelector(selector);
    if (exact) return exact;
    return rowRoot.querySelector('[aria-label^="Select "]');
  }

  function isControlDisabled(control) {
    if (!control) return true;
    if (typeof control.matches === 'function' && control.matches(':disabled')) return true;
    if (control.getAttribute('aria-disabled') === 'true') return true;
    if (control.getAttribute('disabled') != null) return true;
    return false;
  }

  function classifyRow(row) {
    const status = extractStatus(row.rowRoot);
    const tracked = parseTrackedHours(row.rowRoot);
    const selection = findSelectionControl(row.rowRoot, row.dayLabel);
    const locked = isControlDisabled(selection);
    const approved = status === 'Approved';
    const pending = status === 'Pending';
    const trackedFilled = tracked ? tracked.current > 0 : false;
    // Pending rows can still become empty after manual deletion and should be refillable.
    const refillablePending = pending && tracked && tracked.current === 0;
    const emptyEditable = !locked && !approved && tracked && tracked.current === 0;
    const fillCandidate = emptyEditable || refillablePending;

    return {
      dayNumber: row.dayNumber,
      dayLabel: row.dayLabel,
      status,
      tracked,
      locked,
      approved,
      pending,
      trackedFilled,
      refillablePending,
      emptyEditable,
      fillCandidate
    };
  }

  function isFillCandidate(state) {
    return Boolean(state?.fillCandidate);
  }

  function collectFillCandidates(rows) {
    return rows
      .map((row) => ({ row, state: classifyRow(row) }))
      .filter(({ state }) => isFillCandidate(state))
      .sort((a, b) => a.state.dayNumber - b.state.dayNumber);
  }

  function findDayEditorCancelButton(rowRoot) {
    if (!rowRoot) return null;
    return Array.from(rowRoot.querySelectorAll('button')).find((btn) => {
      return /^cancel$/i.test(normalizedText(btn.textContent));
    }) || null;
  }

  function hasTimesheetRows(doc) {
    return Boolean(doc.querySelector('[data-test-id="timesheet-timecard"][role="row"]'));
  }

  function findTimesheetRefreshButton(doc) {
    const emptyState = doc.querySelector('[class*="Timesheet-module__emptyState"]');
    if (emptyState) {
      const inEmpty = Array.from(emptyState.querySelectorAll('button')).find(
        (btn) => normalizedText(btn.textContent) === 'Refresh'
      );
      if (inEmpty) return inEmpty;
    }

    const sheetRoot = doc.querySelector('[class*="Timesheet-module__root"]');
    if (!sheetRoot) return null;

    return (
      Array.from(sheetRoot.querySelectorAll('button')).find(
        (btn) => normalizedText(btn.textContent) === 'Refresh'
      ) || null
    );
  }

  function timesheetLoadState(doc) {
    if (hasTimesheetRows(doc)) {
      return { status: 'ready', refreshButton: null };
    }

    const refreshButton = findTimesheetRefreshButton(doc);
    if (refreshButton) {
      return { status: 'needs_refresh', refreshButton };
    }

    return { status: 'not_ready', refreshButton: null };
  }

  function extractDayRows(doc) {
    const byDay = new Map();

    // Primary: explicit timesheet row nodes (more stable than cell composition).
    const rowNodes = Array.from(doc.querySelectorAll('[data-test-id="timesheet-timecard"][role="row"]'));
    for (const rowNode of rowNodes) {
      const parsed = parseDateFromMixedText(rowNode.textContent);
      if (!parsed || byDay.has(parsed.dayNumber)) continue;
      const optionsButton = rowNode.querySelector('[data-action-name="timesheet-day-options-button"]');
      const selection = findSelectionControl(rowNode, parsed.dayLabel);

      byDay.set(parsed.dayNumber, {
        ...parsed,
        rowRoot: rowNode,
        dateCell: rowNode,
        optionsButton,
        selection
      });
    }

    // Fallback: grid cells composition for older/newer layouts.
    const dateCells = Array.from(doc.querySelectorAll('[role="gridcell"]'))
      .filter((cell) => parseDateLabel(cell.textContent));
    for (const dateCell of dateCells) {
      const parsed = parseDateLabel(dateCell.textContent);
      const rowRoot = resolveRowRoot(dateCell);
      if (!parsed || !rowRoot || byDay.has(parsed.dayNumber)) continue;
      const optionsButton = rowRoot.querySelector('[data-action-name="timesheet-day-options-button"]');
      const selection = findSelectionControl(rowRoot, parsed.dayLabel);

      byDay.set(parsed.dayNumber, {
        ...parsed,
        rowRoot,
        dateCell,
        optionsButton,
        selection
      });
    }

    return Array.from(byDay.values()).sort((a, b) => a.dayNumber - b.dayNumber);
  }

  function findRowByDay(rows, dayNumber) {
    return rows.find((row) => row.dayNumber === dayNumber) || null;
  }

  function resolveOpenForm(row, doc) {
    const scoped = row.rowRoot.querySelector('form[data-test-id="time-entry-form"]');
    if (scoped) return scoped;
    const globalForm = doc.querySelector('form[data-test-id="time-entry-form"]');
    return globalForm || null;
  }

  function isPeriodTypeTrigger(button) {
    if (!button || button.getAttribute('role') !== 'combobox') return false;
    const testId = button.getAttribute('data-test-id') || '';
    if (/project-picker|project/i.test(testId)) return false;
    const label = normalizedText(button.textContent);
    if (/select a project/i.test(label)) return false;
    return true;
  }

  function findPeriodTypeTriggerInRow(periodRow) {
    if (!periodRow) return null;
    return (
      Array.from(periodRow.querySelectorAll('button[role="combobox"]')).find(isPeriodTypeTrigger) ||
      null
    );
  }

  function getPeriodTypeTriggerForRow(entryRow) {
    return findPeriodTypeTriggerInRow(entryRow);
  }

  function getPeriodEntryRows(form) {
    if (!form) return [];
    const byTestId = Array.from(form.querySelectorAll('[data-test-id="timeEntryRow"]'));
    if (byTestId.length) return byTestId;

    const fallback = '[class*="TimePeriodRow"], [class*="timePeriodRow"], [class*="AttendanceTimeCardReadonlyTimePeriodRow"]';
    return Array.from(form.querySelectorAll(fallback));
  }

  function getSpinFieldsForEntryRow(entryRow) {
    if (!entryRow) return [];
    return getSpinFieldsInContainer(entryRow);
  }

  function getSpinFieldsInContainer(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('[role="spinbutton"]'))
      .filter((field) => !isControlDisabled(field));
  }

  function getPeriodTimeInputsByIndex(form, periodIndex) {
    if (!form) return { start: null, end: null };
    return {
      start: form.querySelector(`[data-test-id="periods.${periodIndex}.start"]`),
      end: form.querySelector(`[data-test-id="periods.${periodIndex}.end"]`)
    };
  }

  const PERIOD_TYPE_ALIASES = {
    Work: ['work', 'arbeit'],
    Break: ['break', 'pause', 'ruhepause', 'rest']
  };

  function periodTypeLabelMatches(trigger, expectedType) {
    if (!trigger) return false;
    const actual = normalizedText(trigger.textContent);
    const aliases = PERIOD_TYPE_ALIASES[expectedType] || [String(expectedType).toLowerCase()];
    return aliases.some((alias) => new RegExp(`\\b${alias}\\b`, 'i').test(actual));
  }

  function findPeriodDropdownOptions(trigger) {
    const controlsId = trigger?.getAttribute('aria-controls');
    if (controlsId) {
      const listbox = document.getElementById(controlsId);
      if (listbox) {
        const scoped = Array.from(listbox.querySelectorAll(
          '[role="option"], [data-radix-collection-item], [role="menuitem"]'
        ));
        if (scoped.length) return scoped;
      }
    }

    const expanded = trigger?.getAttribute('aria-expanded') === 'true';
    if (expanded) {
      const nearby = Array.from(document.querySelectorAll('[role="listbox"] [role="option"]'));
      if (nearby.length) return nearby;
    }

    return Array.from(document.querySelectorAll(
      '[role="listbox"] [role="option"], [role="option"], [data-radix-collection-item], [role="menuitem"]'
    ));
  }

  function findAddWorkPeriodButton(form) {
    if (!form) return null;
    const direct =
      form.querySelector('[data-test-id="timecard-add-work"]') ||
      form.querySelector('[data-action-name="timesheet-add-work-period-button"]');
    if (direct && !isControlDisabled(direct)) return direct;

    return Array.from(form.querySelectorAll('button, [role="button"]')).find((btn) => {
      if (isControlDisabled(btn)) return false;
      const testId = btn.getAttribute('data-test-id') || '';
      const action = btn.getAttribute('data-action-name') || '';
      return testId === 'timecard-add-work' || action === 'timesheet-add-work-period-button';
    }) || null;
  }

  function findAddBreakPeriodButton(form) {
    if (!form) return null;
    const direct =
      form.querySelector('[data-test-id="timecard-add-break"]') ||
      form.querySelector('[data-action-name="timesheet-add-break-period-button"]');
    if (direct && !isControlDisabled(direct)) return direct;
    return null;
  }

  function countPeriodTypeRows(form) {
    return getTypeTriggers(form).length;
  }

  function countPeriodRows(form) {
    return countPeriodTypeRows(form);
  }

  function findAddPeriodButton(form) {
    return findAddWorkPeriodButton(form) || findAddBreakPeriodButton(form) || findAddPeriodButtonGeneric(form);
  }

  function findAddPeriodButtonGeneric(form) {
    if (!form) return null;

    function matchesAddPeriodControl(el) {
      if (!el || isControlDisabled(el)) return false;
      const testId = el.getAttribute('data-test-id') || '';
      const action = el.getAttribute('data-action-name') || '';
      const label = normalizedText(el.textContent || el.getAttribute('aria-label') || '');
      if (/add[-_]?period|add[-_]?row|timecard[-_]?add/i.test(testId)) return true;
      if (/add[-_]?period/i.test(action)) return true;
      if (/add\s+(another\s+)?(work\s+|break\s+)?(time\s+)?period/i.test(label)) return true;
      if (/add\s+(work|break)\b/i.test(label) && /period|row|entry/i.test(label)) return true;
      if (/insert\s+(new\s+)?period/i.test(label)) return true;
      if (/new\s+period/i.test(label)) return true;
      return false;
    }

    function searchIn(root) {
      if (!root) return null;

      const selectors = [
        '[data-test-id*="add-period"]',
        '[data-test-id*="add-period-row"]',
        '[data-test-id*="add-work-period"]',
        '[data-test-id*="add-time-period"]',
        '[data-action-name*="add-period"]',
        '[data-action-name*="add-time-period"]',
        'button[data-test-id*="timecard-add"]',
        'a[data-test-id*="add-period"]'
      ];
      for (const selector of selectors) {
        const match = root.querySelector(selector);
        if (matchesAddPeriodControl(match)) return match;
      }

      const controls = Array.from(root.querySelectorAll('button, [role="button"], a'));
      return controls.find(matchesAddPeriodControl) || null;
    }

    const roots = new Set();
    roots.add(form);
    const timeCard = form.closest(
      '[class*="timeCard"], [class*="TimeCard"], [class*="AttendanceTimeCard"], [class*="time-entry"]'
    );
    if (timeCard) {
      roots.add(timeCard);
      if (timeCard.parentElement) roots.add(timeCard.parentElement);
    }
    const rowRoot = form.closest('[role="row"], [data-test-id="timesheet-timecard"]');
    if (rowRoot) roots.add(rowRoot);

    for (const root of roots) {
      const match = searchIn(root);
      if (match) return match;
    }

    return searchIn(form.closest('[class*="Timesheet"]') || null);
  }

  function getTypeTriggers(form) {
    const entryRows = getPeriodEntryRows(form);
    if (entryRows.length) {
      return entryRows
        .map((row) => findPeriodTypeTriggerInRow(row))
        .filter(Boolean);
    }

    return Array.from(form.querySelectorAll('button[role="combobox"]')).filter(isPeriodTypeTrigger);
  }

  function getSpinFields(form) {
    const entryRows = getPeriodEntryRows(form);
    if (entryRows.length) {
      return entryRows.flatMap((row) => getSpinFieldsForEntryRow(row));
    }

    const periodRowSelector =
      '[class*="TimePeriodRow"], [class*="timePeriodRow"], [class*="AttendanceTimeCard"]';
    const fromPeriodRows = [];

    for (const row of form.querySelectorAll(periodRowSelector)) {
      for (const spin of row.querySelectorAll('[role="spinbutton"]')) {
        if (!isControlDisabled(spin)) fromPeriodRows.push(spin);
      }
    }
    if (fromPeriodRows.length) return fromPeriodRows;

    const byTestId = Array.from(
      form.querySelectorAll('[data-test-id*="periods."], input[inputmode="numeric"]')
    ).filter((field) => !isControlDisabled(field));
    if (byTestId.length) return byTestId;

    return Array.from(form.querySelectorAll('[role="spinbutton"]'))
      .filter((field) => !isControlDisabled(field));
  }

  function getSaveButton(form) {
    return form.querySelector('[data-test-id="timecard-save-button"]');
  }

  function getDeleteButtons(form) {
    return Array.from(form.querySelectorAll('[data-test-id^="timecard-delete-period-"]'));
  }

  function findReviewTimeEntriesModal(doc) {
    const root = doc || document;
    const candidates = Array.from(root.querySelectorAll('[role="dialog"], [aria-modal="true"]'));
    return candidates.find((node) => /review time entries/i.test(normalizedText(node.textContent))) || null;
  }

  function dismissReviewTimeEntriesModal(doc, clickFn) {
    const modal = findReviewTimeEntriesModal(doc);
    if (!modal) return false;

    const buttons = Array.from(modal.querySelectorAll('button'));
    const editBtn = buttons.find((btn) => /^edit$/i.test(normalizedText(btn.textContent)));
    const cancelBtn = buttons.find((btn) => /^(cancel|close|back)$/i.test(normalizedText(btn.textContent)));
    const closeIcon = modal.querySelector(
      '[aria-label="Close"], [data-test-id*="close"], button[class*="close"]'
    );

    const target = editBtn || cancelBtn || closeIcon;
    if (target && clickFn) {
      clickFn(target);
      return true;
    }

    if (target) {
      target.click();
      return true;
    }

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true
    }));
    return true;
  }

  return {
    parseDateLabel,
    parseDateFromMixedText,
    parseTrackedHours,
    extractStatus,
    hasTimesheetRows,
    findTimesheetRefreshButton,
    timesheetLoadState,
    extractDayRows,
    findRowByDay,
    classifyRow,
    isFillCandidate,
    collectFillCandidates,
    findDayEditorCancelButton,
    resolveOpenForm,
    getTypeTriggers,
    getPeriodEntryRows,
    getSpinFieldsForEntryRow,
    getSpinFieldsInContainer,
    getPeriodTimeInputsByIndex,
    periodTypeLabelMatches,
    findPeriodDropdownOptions,
    getPeriodTypeTriggerForRow,
    countPeriodRows,
    countPeriodTypeRows,
    findAddPeriodButton,
    findAddWorkPeriodButton,
    findAddBreakPeriodButton,
    isPeriodTypeTrigger,
    getSpinFields,
    getSaveButton,
    getDeleteButtons,
    findReviewTimeEntriesModal,
    dismissReviewTimeEntriesModal,
    isControlDisabled,
    findSelectionControl,
    normalizedText
  };
});


/* --- src/time-entry-fill.js --- */
(function initTimeEntryFill(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PersonioTimeEntryFill = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function factory() {
  'use strict';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function entryRowAt(form, dom, index) {
    const rows = dom.getPeriodEntryRows(form);
    if (!rows[index]) {
      throw new Error(`Period row ${index} missing (${rows.length} row(s) in form).`);
    }
    return rows[index];
  }

  async function ensurePeriodType(entryRow, expectedType, deps, options) {
    const { dom, click, sleep, poll, log } = deps;
    const opts = options || {};
    const trigger = dom.getPeriodTypeTriggerForRow(entryRow);
    if (!trigger) {
      log(`No type dropdown on row (skip set ${expectedType})`);
      return false;
    }

    if (dom.periodTypeLabelMatches(trigger, expectedType)) {
      log(`Period type already ${expectedType}`);
      return true;
    }

    click(trigger);
    await sleep(280);

    const option = await poll(() => {
      const options = dom.findPeriodDropdownOptions(trigger);
      return options.find((node) => dom.periodTypeLabelMatches(node, expectedType)) || null;
    }, { timeoutMs: 4000, intervalMs: 120 });

    if (!option) {
      if (opts.optional) {
        log(`Could not select ${expectedType} (optional — continuing with period time fields)`);
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true
        }));
        await sleep(150);
        return false;
      }
      throw new Error(`Cannot select period type "${expectedType}" (dropdown option not found).`);
    }

    click(option);
    await sleep(200);
    log(`Set period type → ${expectedType}`);
    return true;
  }

  async function fillTimeInputGroup(group, hours, minutes, deps, label) {
    const { dom, spinFill, sleep, log } = deps;
    if (!group) throw new Error(`Time input group missing for ${label}`);

    const fields = dom.getSpinFieldsInContainer(group);
    if (fields.length < 2) {
      throw new Error(`Expected 2 spin fields in ${label}, found ${fields.length}.`);
    }

    const values = [pad2(hours), pad2(minutes)];
    log(`  ${label}: ${values[0]}:${values[1]}`);

    await spinFill.fillSpinFields(fields, values, {
      sleep,
      log: (line) => log(`    ${line}`),
      force: true
    });
    await sleep(120);
  }

  async function fillPeriodByIndex(form, periodIndex, period, deps) {
    const { dom, log, sleep } = deps;
    const { start, end } = dom.getPeriodTimeInputsByIndex(form, periodIndex);
    if (!start || !end) {
      throw new Error(`periods.${periodIndex}.start / .end not found in form.`);
    }

    log(`Fill periods.${periodIndex} (${period.type})`);
    await fillTimeInputGroup(
      start,
      period.start.hours,
      period.start.minutes,
      deps,
      `periods.${periodIndex}.start`
    );
    await fillTimeInputGroup(
      end,
      period.end.hours,
      period.end.minutes,
      deps,
      `periods.${periodIndex}.end`
    );
    await sleep(100);
  }

  async function ensureThirdWorkRow(form, deps) {
    const { dom, click, sleep, poll, log } = deps;
    let rows = dom.getPeriodEntryRows(form);
    if (rows.length >= 3) return rows;

    const addWork = dom.findAddWorkPeriodButton(form);
    if (!addWork) {
      throw new Error('Add Work button [data-test-id="timecard-add-work"] not found.');
    }

    const before = rows.length;
    click(addWork);
    log('Clicked + Work (timecard-add-work)');
    await sleep(400);

    await poll(() => {
      const next = dom.getPeriodEntryRows(form);
      return next.length > before ? next : null;
    }, { timeoutMs: 5000, intervalMs: 200 });

    rows = dom.getPeriodEntryRows(form);
    if (rows.length < 3) {
      throw new Error(`Expected 3 period rows after + Work, found ${rows.length}.`);
    }
    return rows;
  }

  /**
   * Personio default: periods.0 Work, periods.1 Break, click + Work → periods.2 Work.
   * Types on rows 0–1 are left as-shipped; only times are filled via periods.N.* test ids.
   */
  async function fillWorkBreakWorkForm(form, periods, deps) {
    const { dom } = deps;
    if (!periods || periods.length < 3) {
      throw new Error('Work-Break-Work requires 3 periods.');
    }

    const entryRows = dom.getPeriodEntryRows(form);
    if (entryRows.length < 2) {
      throw new Error(`Expected at least 2 period rows, found ${entryRows.length}.`);
    }

    deps.log(`Period rows in DOM: ${entryRows.length} (fill times by periods.N; skip type on rows 0–1)`);

    await fillPeriodByIndex(form, 0, periods[0], deps);
    await fillPeriodByIndex(form, 1, periods[1], deps);

    await ensureThirdWorkRow(form, deps);
    await ensurePeriodType(entryRowAt(form, dom, 2), periods[2].type, deps, { optional: true });
    await fillPeriodByIndex(form, 2, periods[2], deps);

    return dom.getPeriodEntryRows(form).length;
  }

  return {
    fillWorkBreakWorkForm
  };
});


/* --- tests/console-pretest-runner.js --- */
/**
 * Browser-console pretest runner. Bundled with src modules via build-console-pretest.js
 */
(function initConsolePretest(root) {
  'use strict';

  const dom = root.PersonioDom;
  const personioConfig = root.PersonioConfig;
  const timeModel = root.PersonioTimeModel;
  const safety = root.PersonioSafety;
  const spinFill = root.PersonioSpinFill;
  const timeEntryFill = root.PersonioTimeEntryFill;

  if (!dom || !personioConfig || !timeModel || !safety || !spinFill || !timeEntryFill) {
    throw new Error('Missing PersonioDom / PersonioConfig / PersonioTimeModel / PersonioSafety / PersonioSpinFill / PersonioTimeEntryFill');
  }

  function pageAccountConfig() {
    const employeeMatch = location.pathname.match(/\/attendance\/employee\/(\d+)/);
    return {
      personio_subdomain: personioConfig.subdomainFromHostname(location.hostname),
      employee_id: employeeMatch ? employeeMatch[1] : ''
    };
  }

  const DEFAULT_SETTINGS = {
    workday_start: '09:00',
    workday_end: '18:00',
    break_minutes: 60
  };

  function click(el) {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.click();
  }

  async function ensureTimesheetReady(logger) {
    const loadState = dom.timesheetLoadState(document);
    if (loadState.status === 'ready') return true;

    if (loadState.status === 'needs_refresh') {
      logger.push('Timesheet empty state — clicking Refresh.');
      click(loadState.refreshButton);
      const ready = await safety.poll(
        () => (dom.timesheetLoadState(document).status === 'ready' ? true : null),
        { timeoutMs: 15000, intervalMs: 250 }
      );
      if (!ready) {
        throw new Error('Timesheet still empty after Refresh. Reload the attendance page and try again.');
      }
      const rowCount = dom.extractDayRows(document).length;
      logger.push(`Timesheet loaded (${rowCount} day row(s)).`);
      return true;
    }

    throw new Error(
      'Timesheet not loaded yet. Open monthly attendance, wait for the grid, or refresh the page.'
    );
  }

  function explainState(state) {
    const reasons = [];
    if (state.locked) reasons.push('locked');
    if (state.approved) reasons.push('approved');
    if (state.pending && !state.refillablePending) reasons.push('pending_with_hours');
    if (!state.tracked) reasons.push('no_tracked_hours');
    else if (state.tracked.current > 0) reasons.push(`tracked=${state.tracked.label}`);
    if (state.refillablePending) reasons.push('UNFILLED_PENDING');
    if (state.emptyEditable) reasons.push('UNFILLED');
    return reasons.join(', ') || 'unknown';
  }

  async function closeDayEditor(row, logger) {
    const cancel = dom.findDayEditorCancelButton(row.rowRoot);
    if (cancel) {
      click(cancel);
      logger.push(`Closed editor for ${row.dayLabel}`);
      await safety.sleep(400);
      return;
    }
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true
    }));
    await safety.sleep(300);
  }

  function clearHighlights() {
    document.querySelectorAll('[data-personio-pretest-highlight]').forEach((el) => {
      el.style.outline = '';
      el.removeAttribute('data-personio-pretest-highlight');
    });
  }

  function highlightRow(rowRoot, color) {
    rowRoot.style.outline = `3px solid ${color}`;
    rowRoot.setAttribute('data-personio-pretest-highlight', '1');
  }

  function listUnfilledSpinFields(form) {
    return dom.getSpinFields(form)
      .map((field, index) => ({
        index,
        field,
        value: spinFill.readFieldValue(field),
        unfilled: spinFill.isFieldUnfilled(field)
      }))
      .filter((entry) => entry.unfilled);
  }

  /**
   * Scan month grid for days with 0h tracked and editable (not locked/approved).
   */
  async function detectUnfilledDays(options) {
    const opts = options || {};
    const targetDays = opts.days || null;
    const logger = safety.makeLogger();
    await ensureTimesheetReady(logger);
    for (const line of logger.all()) console.log(line);
    if (opts.highlight !== false) clearHighlights();

    const rows = dom.extractDayRows(document);
    const candidates = dom.collectFillCandidates(rows);
    const states = rows.map((row) => ({ row, state: dom.classifyRow(row) }));

    const counts = {
      locked: states.filter((s) => s.state.locked).length,
      approved: states.filter((s) => s.state.approved).length,
      pending: states.filter((s) => s.state.pending).length,
      refillablePending: states.filter((s) => s.state.refillablePending).length,
      emptyEditable: states.filter((s) => s.state.emptyEditable).length,
      fillCandidates: candidates.length
    };

    const filtered = targetDays
      ? candidates.filter((s) => targetDays.includes(s.state.dayNumber))
      : candidates;

    console.log('=== Detect unfilled days (0h tracked, editable — sorted day 1 → end) ===');
    console.log(`timesheet-timecard rows: ${rows.length}`);
    console.log(
      `Summary: fill_candidates=${filtered.length}, empty=${counts.emptyEditable}, pending_refillable=${counts.refillablePending}, locked=${counts.locked}, approved=${counts.approved}`
    );

    const days = filtered.map(({ row, state }) => {
      if (opts.highlight !== false) highlightRow(row.rowRoot, '#22c55e');
      console.log(
        `UNFILLED day ${state.dayNumber} (${state.dayLabel}) | ${explainState(state)} | day-index=${row.rowRoot.getAttribute('data-day-index')}`
      );
      console.log(`  row: "${dom.normalizedText(row.rowRoot.textContent)}"`);
      return {
        dayNumber: state.dayNumber,
        dayLabel: state.dayLabel,
        tracked: state.tracked?.label,
        dayIndex: row.rowRoot.getAttribute('data-day-index'),
        trackable: row.rowRoot.getAttribute('data-trackable'),
        rowText: dom.normalizedText(row.rowRoot.textContent)
      };
    });

    if (!days.length) {
      console.log('No unfilled days found.');
    }

    return { rows, states, counts, unfilled: days, candidates: filtered };
  }

  async function runScan(options) {
    const opts = options || {};
    const targetDays = opts.days || null;
    const logger = safety.makeLogger();
    await ensureTimesheetReady(logger);
    for (const line of logger.all()) console.log(line);
    clearHighlights();

    const rows = dom.extractDayRows(document);
    const states = rows.map((row) => {
      const state = dom.classifyRow(row);
      return { row, state };
    });

    const counts = {
      locked: states.filter((s) => s.state.locked).length,
      approved: states.filter((s) => s.state.approved).length,
      pending: states.filter((s) => s.state.pending).length,
      refillablePending: states.filter((s) => s.state.refillablePending).length,
      emptyEditable: states.filter((s) => s.state.emptyEditable).length
    };

    console.log('=== Scan all days ===');
    console.log(`timesheet-timecard rows: ${rows.length}`);
    console.log(
      `Scan: unfilled=${counts.emptyEditable}, pending_refillable=${counts.refillablePending}, locked=${counts.locked}, approved=${counts.approved}, pending=${counts.pending}`
    );

    const filtered = targetDays
      ? states.filter((s) => targetDays.includes(s.state.dayNumber))
      : states;

    filtered.forEach(({ row, state }) => {
      const trackable = row.rowRoot.getAttribute('data-trackable');
      const dayIndex = row.rowRoot.getAttribute('data-day-index');
      const color = state.emptyEditable ? '#22c55e' : state.locked ? '#ef4444' : '#f59e0b';
      if (opts.highlight !== false) highlightRow(row.rowRoot, color);

      console.log(
        `Day ${state.dayNumber} (${state.dayLabel}) | ${explainState(state)} | trackable=${trackable} | day-index=${dayIndex}`
      );
      console.log(`  text: "${dom.normalizedText(row.rowRoot.textContent)}"`);
      if (row.selection) {
        const selDisabled = dom.isControlDisabled?.(row.selection);
        console.log(`  selection: aria-label="${row.selection.getAttribute('aria-label')}" disabled=${selDisabled} offsetParent=${row.selection.offsetParent !== null}`);
      } else {
        console.log('  selection: NOT FOUND');
      }
    });

    return { rows, states, counts, candidates: states.filter((s) => s.state.emptyEditable) };
  }

  async function waitForFormForRow(row) {
    return safety.poll(() => dom.resolveOpenForm(row, document), {
      timeoutMs: 4000,
      intervalMs: 120
    });
  }

  async function openEditorForRow(row, logger) {
    let form = dom.resolveOpenForm(row, document);
    if (form && row.rowRoot.contains(form)) return form;

    row.rowRoot.scrollIntoView({ block: 'center', behavior: 'instant' });
    await safety.sleep(80);

    if (row.dateCell) {
      click(row.dateCell);
      form = await waitForFormForRow(row);
      if (form) return form;
    }

    if (row.selection) {
      click(row.selection);
      form = await waitForFormForRow(row);
      if (form) return form;
    }

    const optionsBtn = row.optionsButton ||
      row.rowRoot.querySelector('[data-action-name="timesheet-day-options-button"]') ||
      Array.from(row.rowRoot.querySelectorAll('button')).find((btn) => {
        const label = dom.normalizedText(btn.getAttribute('aria-label') || btn.textContent);
        return label === 'Timecard Options';
      });
    if (optionsBtn) {
      click(optionsBtn);
      const trackItem = await safety.poll(() => {
        const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
        return items.find((item) => /track\s+0h\s+day/i.test(dom.normalizedText(item.textContent))) || null;
      }, { timeoutMs: 2500, intervalMs: 100 });
      if (trackItem) {
        click(trackItem);
        logger.push(`Opened via Timecard Options → Track 0h day for ${row.dayLabel}`);
        await safety.sleep(300);
        form = await waitForFormForRow(row);
        if (form) return form;
      }
    }

    throw new Error(`Unable to open editor for ${row.dayLabel}.`);
  }

  function fillDeps(logger) {
    return {
      dom,
      spinFill,
      click,
      sleep: safety.sleep,
      poll: safety.poll,
      log: (line) => logger.push(line)
    };
  }

  async function verifySaved(dayNumber) {
    return safety.poll(() => {
      const rows = dom.extractDayRows(document);
      const row = dom.findRowByDay(rows, dayNumber);
      if (!row) return null;
      const state = dom.classifyRow(row);
      if (state.tracked && state.tracked.current > 0) return state;
      return null;
    }, { timeoutMs: 6500, intervalMs: 200 });
  }

  async function fillDay(dayNumber, settings) {
    const logger = safety.makeLogger();
    const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };

    try {
      safety.assertAttendanceLocation(location.href, pageAccountConfig());
      await ensureTimesheetReady(logger);
    } catch (e) {
      console.error(e.message);
      return { ok: false, message: e.message };
    }

    const rows = dom.extractDayRows(document);
    const row = dom.findRowByDay(rows, dayNumber);
    if (!row) {
      console.error(`Day ${dayNumber} not found among ${rows.length} rows`);
      return { ok: false, message: 'row_not_found' };
    }

    const state = dom.classifyRow(row);
    console.log(`fillDay(${dayNumber}) state:`, state, explainState(state));

    if (!dom.isFillCandidate(state)) {
      return { ok: false, message: 'not_fill_candidate', state, logs: logger.all() };
    }

    if (dom.findReviewTimeEntriesModal(document)) {
      dom.dismissReviewTimeEntriesModal(document, click);
      logger.push('Dismissed "Review time entries" modal (Edit).');
      await safety.sleep(400);
    }

    const form = await openEditorForRow(row, logger);
    const periods = timeModel.derivePeriods(cfg);
    console.log('Periods:', timeModel.describePeriods(periods));

    await timeEntryFill.fillWorkBreakWorkForm(form, periods, fillDeps(logger));

    const saveButton = dom.getSaveButton(form);
    if (!saveButton) throw new Error(`Save button missing in ${row.dayLabel}.`);
    click(saveButton);
    logger.push(`Save clicked for ${row.dayLabel}`);
    await safety.sleep(500);

    if (dom.findReviewTimeEntriesModal(document)) {
      dom.dismissReviewTimeEntriesModal(document, click);
      logger.push('Dismissed "Review time entries" modal after save (Edit).');
      await safety.sleep(400);
      await closeDayEditor(row, logger);
      return {
        ok: false,
        message: 'validation_modal',
        state,
        logs: logger.all()
      };
    }

    const saved = await verifySaved(dayNumber);
    if (!saved) {
      await closeDayEditor(row, logger);
      throw new Error(`Save not persisted for ${row.dayLabel}.`);
    }

    logger.push(`Saved ${row.dayLabel}: ${saved.tracked.label}`);
    await closeDayEditor(row, logger);
    console.log('SUCCESS:', logger.all().join('\n'));
    return { ok: true, saved, logs: logger.all() };
  }

  async function verifyCleared(dayNumber) {
    return safety.poll(() => {
      const rows = dom.extractDayRows(document);
      const row = dom.findRowByDay(rows, dayNumber);
      if (!row) return null;
      const state = dom.classifyRow(row);
      if (state.tracked && state.tracked.current === 0 && !state.approved) return state;
      return null;
    }, { timeoutMs: 6500, intervalMs: 200 });
  }

  async function revertDay(dayNumber) {
    const logger = safety.makeLogger();
    safety.assertAttendanceLocation(location.href, pageAccountConfig());
    await ensureTimesheetReady(logger);

    const rows = dom.extractDayRows(document);
    const row = dom.findRowByDay(rows, dayNumber);
    if (!row) return { ok: false, message: `Day ${dayNumber} not found.`, logs: logger.all() };

    const state = dom.classifyRow(row);
    if (state.locked || state.approved) {
      return {
        ok: true,
        summary: `Day ${dayNumber} not editable (${state.locked ? 'locked' : 'approved'}).`,
        logs: logger.all()
      };
    }

    if (!state.tracked || state.tracked.current === 0) {
      return { ok: true, summary: `Day ${dayNumber} already empty.`, logs: logger.all() };
    }

    const form = await openEditorForRow(row, logger);
    const deleteButtons = dom.getDeleteButtons(form);
    for (const button of deleteButtons) {
      click(button);
      logger.push('Deleted period row.');
      await safety.sleep(120);
    }

    const saveButton = dom.getSaveButton(form);
    if (!saveButton) throw new Error(`Save button missing while reverting day ${dayNumber}.`);
    click(saveButton);
    logger.push(`Save clicked for revert day ${dayNumber}.`);

    const reverted = await verifyCleared(dayNumber);
    if (!reverted) throw new Error(`Revert did not clear day ${dayNumber}.`);

    logger.push(`Reverted day ${dayNumber}: ${reverted.tracked.label}`);
    console.log('REVERT OK:', logger.all().join('\n'));
    return { ok: true, summary: `Day ${dayNumber} cleared.`, logs: logger.all() };
  }

  /**
   * Manual test entry: detect unfilled days, fill them, verify.
   * options.dryRun === true → detect only, no fill.
   */
  async function run(options) {
    const opts = options || {};
    const cfg = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };
    const dryRun = opts.dryRun === true;
    const stopOnError = opts.stopOnError === true;

    if (dom.findReviewTimeEntriesModal(document)) {
      dom.dismissReviewTimeEntriesModal(document, click);
      console.log('Dismissed "Review time entries" modal before run.');
      await safety.sleep(400);
    }

    const detection = await detectUnfilledDays(opts);
    if (!detection.unfilled.length) {
      return { ok: true, phase: 'done', filled: 0, detection, results: [], after: detection };
    }

    if (dryRun) {
      console.log(`Dry run: would fill ${detection.unfilled.length} day(s).`);
      return { ok: true, phase: 'dry_run', filled: 0, detection, results: [] };
    }

    console.log(`=== Fill ${detection.unfilled.length} unfilled day(s) ===`);
    const results = [];
    for (const day of detection.unfilled) {
      console.log(`--- Filling day ${day.dayNumber} (${day.dayLabel}) ---`);
      const result = await fillDay(day.dayNumber, cfg);
      results.push({ dayNumber: day.dayNumber, dayLabel: day.dayLabel, ...result });
      if (!result.ok && stopOnError) {
        console.error(`Stopped at day ${day.dayNumber}: ${result.message}`);
        return { ok: false, phase: 'fill', filled: results.filter((r) => r.ok).length, detection, results };
      }
      if (!result.ok) {
        console.warn(`Skipped day ${day.dayNumber}: ${result.message}`);
      }
      await safety.sleep(300);
    }

    const filled = results.filter((r) => r.ok).length;
    console.log('=== Verify after fill ===');
    const after = await detectUnfilledDays({ days: opts.days, highlight: opts.highlight });
    const remaining = after.unfilled.length;

    console.log(`Done: filled=${filled}, still_unfilled=${remaining}`);
    return {
      ok: remaining === 0,
      phase: 'done',
      filled,
      remaining,
      detection,
      results,
      after
    };
  }

  async function runFillAndRevert(dayNumber, settings) {
    const scan = await runScan({ days: [dayNumber], highlight: true });
    const fill = await fillDay(dayNumber, settings);
    if (!fill.ok) return { ok: false, phase: 'fill', fill, scan };
    const revert = await revertDay(dayNumber);
    const after = await runScan({ days: [dayNumber], highlight: false });
    return { ok: revert.ok, phase: 'done', fill, revert, after };
  }

  async function runAutoFill(settings) {
    return run({ settings, highlight: true });
  }

  root.PersonioMainPretest = {
    run,
    detectUnfilledDays,
    runScan,
    fillDay,
    revertDay,
    runFillAndRevert,
    runAutoFill,
    listUnfilledSpinFields,
    isFieldUnfilled: spinFill.isFieldUnfilled,
    explainState,
    DEFAULT_SETTINGS
  };

  console.log('PersonioMainPretest ready.');
  console.log('  await PersonioMainPretest.run()                    // all unfilled days (day 1 → end), fill each');
  console.log('  await PersonioMainPretest.run({ dryRun: true })    // detect only');
  console.log('  await PersonioMainPretest.detectUnfilledDays()     // list fill candidates (sorted)');
  console.log('  await PersonioMainPretest.fillDay(15)              // fill one day by number');
  console.log('  await PersonioMainPretest.runScan({ highlight: true })');
})(typeof globalThis !== 'undefined' ? globalThis : window);

