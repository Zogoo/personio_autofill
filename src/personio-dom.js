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
