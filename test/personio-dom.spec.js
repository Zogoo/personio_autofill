const test = require('node:test');
const assert = require('node:assert/strict');

const dom = require('../src/personio-dom.js');

function createSelectionControl(disabled) {
  return {
    matches(selector) {
      return selector === ':disabled' ? Boolean(disabled) : false;
    },
    getAttribute(name) {
      if (name === 'aria-disabled') return disabled ? 'true' : 'false';
      if (name === 'disabled') return disabled ? '' : null;
      return null;
    }
  };
}

function createRowRoot({ statusText = '', trackedLabel = '0h / 8h', disabled = false }) {
  const selection = createSelectionControl(disabled);
  return {
    querySelectorAll(selector) {
      if (selector === 'span, div') {
        return [{ textContent: statusText }, { textContent: trackedLabel }];
      }
      if (selector === '[role="gridcell"], div, span') {
        return [{ textContent: trackedLabel }];
      }
      return [];
    },
    querySelector(selector) {
      if (selector.startsWith('[aria-label="Select ')) return selection;
      if (selector === '[aria-label^="Select "]') return selection;
      return null;
    }
  };
}

test('parseDateLabel parses valid day labels', () => {
  const parsed = dom.parseDateLabel('19 May');
  assert.deepEqual(parsed, { dayNumber: 19, monthLabel: 'May', dayLabel: '19 May' });
});

test('parseDateLabel parses day labels with weekday prefix', () => {
  const parsed = dom.parseDateLabel('Tue 19 May');
  assert.deepEqual(parsed, { dayNumber: 19, monthLabel: 'May', dayLabel: '19 May' });
});

test('parseDateFromMixedText parses row text with hours', () => {
  const parsed = dom.parseDateFromMixedText('Mon 18 May 0h/8h -8h');
  assert.deepEqual(parsed, { dayNumber: 18, monthLabel: 'May', dayLabel: '18 May' });
});

test('parseDateFromMixedText parses collapsed Personio row text', () => {
  const parsed = dom.parseDateFromMixedText('Mon18 May0h/8h-8h');
  assert.deepEqual(parsed, { dayNumber: 18, monthLabel: 'May', dayLabel: '18 May' });
});

test('classifyRow marks approved and locked', () => {
  const row = {
    dayNumber: 5,
    dayLabel: '5 May',
    rowRoot: createRowRoot({ statusText: 'Approved', trackedLabel: '8h / 8h', disabled: true })
  };
  const result = dom.classifyRow(row);
  assert.equal(result.approved, true);
  assert.equal(result.locked, true);
  assert.equal(result.emptyEditable, false);
});

test('classifyRow marks empty editable row', () => {
  const row = {
    dayNumber: 19,
    dayLabel: '19 May',
    rowRoot: createRowRoot({ statusText: '', trackedLabel: '0h / 8h', disabled: false })
  };
  const result = dom.classifyRow(row);
  assert.equal(result.emptyEditable, true);
  assert.equal(result.pending, false);
  assert.equal(result.approved, false);
});

function createTimesheetDoc({ rowCount = 0, refreshInEmptyState = false } = {}) {
  const refreshButton = refreshInEmptyState
    ? { textContent: 'Refresh', getAttribute: () => null }
    : null;
  const emptyState = refreshInEmptyState
    ? {
        querySelectorAll: (sel) => (sel === 'button' ? [refreshButton] : []),
        querySelector: () => null
      }
    : null;
  const rowNodes =
    rowCount > 0
      ? [{ textContent: 'Mon 18 May 0h/8h', querySelector: () => null, querySelectorAll: () => [] }]
      : [];

  return {
    querySelector(selector) {
      if (selector === '[data-test-id="timesheet-timecard"][role="row"]') {
        return rowCount > 0 ? rowNodes[0] : null;
      }
      if (selector.includes('Timesheet-module__emptyState')) return emptyState;
      if (selector.includes('Timesheet-module__root')) {
        return refreshInEmptyState && !emptyState
          ? { querySelectorAll: (sel) => (sel === 'button' ? [refreshButton] : []) }
          : emptyState
            ? emptyState
            : { querySelectorAll: () => [] };
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-test-id="timesheet-timecard"][role="row"]') return rowNodes;
      return [];
    }
  };
}

test('timesheetLoadState detects needs_refresh empty state', () => {
  const doc = createTimesheetDoc({ rowCount: 0, refreshInEmptyState: true });
  const state = dom.timesheetLoadState(doc);
  assert.equal(state.status, 'needs_refresh');
  assert.ok(state.refreshButton);
});

function createCombobox({ text, testId = null }) {
  return {
    getAttribute(name) {
      if (name === 'role') return 'combobox';
      if (name === 'data-test-id') return testId;
      return null;
    },
    textContent: text,
    matches(selector) {
      if (selector.includes('project-picker')) {
        return Boolean(testId && testId.includes('project-picker'));
      }
      return false;
    }
  };
}

test('isPeriodTypeTrigger rejects project picker combobox', () => {
  const projectBtn = createCombobox({
    text: 'Select a project',
    testId: 'time-period-row-project-picker-trigger'
  });
  assert.equal(dom.isPeriodTypeTrigger(projectBtn), false);
  assert.equal(dom.isPeriodTypeTrigger(createCombobox({ text: 'Work' })), true);
});

test('findReviewTimeEntriesModal detects validation dialog', () => {
  const doc = {
    querySelectorAll(sel) {
      if (sel.includes('dialog')) {
        return [{ textContent: 'Review time entries\nEdit\nConfirm' }];
      }
      return [];
    }
  };
  assert.ok(dom.findReviewTimeEntriesModal(doc));
});

test('findAddPeriodButton matches add period control', () => {
  const addBtn = {
    getAttribute: (name) => (name === 'data-test-id' ? 'timecard-add-period-button' : null),
    textContent: 'Add period',
    matches: () => false
  };
  const form = {
    querySelector(sel) {
      if (sel.includes('add-period')) return addBtn;
      return null;
    },
    querySelectorAll: () => [],
    closest: () => null
  };
  assert.equal(dom.findAddPeriodButton(form), addBtn);
});

test('countPeriodRows counts period entry rows', () => {
  const typeBtn = createCombobox({ text: 'Work' });
  const periodRow = {
    getAttribute: () => 'timeEntryRow',
    querySelectorAll(sel) {
      if (sel === 'button[role="combobox"]') return [typeBtn];
      if (sel === '[role="spinbutton"]') return [];
      return [];
    }
  };
  const form = {
    querySelectorAll(sel) {
      if (sel.includes('timeEntryRow')) return [periodRow, periodRow];
      return [];
    }
  };
  assert.equal(dom.countPeriodRows(form), 2);
});

test('findAddWorkPeriodButton matches timecard-add-work', () => {
  const addBtn = {
    getAttribute(name) {
      if (name === 'data-test-id') return 'timecard-add-work';
      if (name === 'data-action-name') return 'timesheet-add-work-period-button';
      return null;
    },
    textContent: 'Work',
    matches: () => false
  };
  const form = {
    querySelector(sel) {
      if (sel.includes('timecard-add-work')) return addBtn;
      return null;
    },
    querySelectorAll: () => []
  };
  assert.equal(dom.findAddWorkPeriodButton(form), addBtn);
});

test('getPeriodTimeInputsByIndex finds start and end groups', () => {
  const form = {
    querySelector(sel) {
      if (sel === '[data-test-id="periods.0.start"]') return { id: 'start' };
      if (sel === '[data-test-id="periods.0.end"]') return { id: 'end' };
      return null;
    }
  };
  const inputs = dom.getPeriodTimeInputsByIndex(form, 0);
  assert.equal(inputs.start.id, 'start');
  assert.equal(inputs.end.id, 'end');
});

test('periodTypeLabelMatches accepts Work and Break labels', () => {
  assert.equal(dom.periodTypeLabelMatches({ textContent: 'Work' }, 'Work'), true);
  assert.equal(dom.periodTypeLabelMatches({ textContent: 'Break' }, 'Break'), true);
  assert.equal(dom.periodTypeLabelMatches({ textContent: 'Pause' }, 'Break'), true);
  assert.equal(dom.periodTypeLabelMatches({ textContent: 'Arbeit' }, 'Work'), true);
});

test('getPeriodEntryRows prefers timeEntryRow test id', () => {
  const rowA = { getAttribute: () => 'timeEntryRow' };
  const rowB = { getAttribute: () => 'timeEntryRow' };
  const form = {
    querySelectorAll(sel) {
      if (sel.includes('timeEntryRow')) return [rowA, rowB];
      return [];
    }
  };
  assert.equal(dom.getPeriodEntryRows(form).length, 2);
});

test('getTypeTriggers skips project picker and returns Work/Break control', () => {
  const typeBtn = createCombobox({ text: 'Work' });
  const projectBtn = createCombobox({
    text: 'Select a project',
    testId: 'time-period-row-project-picker-trigger'
  });
  const periodRow = {
    querySelectorAll(sel) {
      if (sel === 'button[role="combobox"]') return [projectBtn, typeBtn];
      return [];
    }
  };
  const spins = Array.from({ length: 4 }, () => ({
    closest: () => periodRow
  }));
  const form = {
    querySelectorAll(sel) {
      if (sel === '[role="spinbutton"]') return spins;
      if (sel === 'button[role="combobox"]') return [projectBtn, typeBtn];
      if (sel.includes('TimePeriodRow')) return [periodRow];
      return [];
    },
    querySelector(sel) {
      if (sel.includes('TimePeriodRow')) return periodRow;
      return null;
    }
  };

  const triggers = dom.getTypeTriggers(form);
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0], typeBtn);
});

test('timesheetLoadState returns ready when rows exist', () => {
  const doc = createTimesheetDoc({ rowCount: 1 });
  const state = dom.timesheetLoadState(doc);
  assert.equal(state.status, 'ready');
  assert.equal(state.refreshButton, null);
});

test('classifyRow allows pending row with zero tracked as refillable', () => {
  const row = {
    dayNumber: 18,
    dayLabel: '18 May',
    rowRoot: createRowRoot({ statusText: 'Pending', trackedLabel: '0h / 8h', disabled: false })
  };
  const result = dom.classifyRow(row);
  assert.equal(result.pending, true);
  assert.equal(result.refillablePending, true);
  assert.equal(result.emptyEditable, true);
  assert.equal(result.fillCandidate, true);
});

test('collectFillCandidates returns unfilled rows sorted from day 1 upward', () => {
  const rows = [
    { dayNumber: 19, dayLabel: '19 May', rowRoot: createRowRoot({ trackedLabel: '0h / 8h' }) },
    { dayNumber: 3, dayLabel: '3 May', rowRoot: createRowRoot({ trackedLabel: '0h / 8h' }) },
    { dayNumber: 10, dayLabel: '10 May', rowRoot: createRowRoot({ trackedLabel: '8h / 8h' }) }
  ];
  const candidates = dom.collectFillCandidates(rows);
  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((c) => c.state.dayNumber),
    [3, 19]
  );
});

test('isFillCandidate rejects locked empty row', () => {
  const row = {
    dayNumber: 7,
    dayLabel: '7 May',
    rowRoot: createRowRoot({ trackedLabel: '0h / 8h', disabled: true })
  };
  const state = dom.classifyRow(row);
  assert.equal(dom.isFillCandidate(state), false);
});
