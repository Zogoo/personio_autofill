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
