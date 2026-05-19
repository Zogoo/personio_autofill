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
