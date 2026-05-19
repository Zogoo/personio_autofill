(function initContentScript(root) {
  'use strict';

  const safety = root.PersonioSafety;
  const dom = root.PersonioDom;
  const personioConfig = root.PersonioConfig;
  const timeModel = root.PersonioTimeModel;
  const spinFill = root.PersonioSpinFill;
  const timeEntryFill = root.PersonioTimeEntryFill;

  const ALLOWED_COMMANDS = new Set(['AUTO_FILL', 'REVERT_DAY']);

  const DEFAULT_SCHEDULE = {
    workday_start: '09:00',
    workday_end: '18:00',
    break_minutes: 60
  };

  if (!safety || !dom || !personioConfig || !timeModel || !spinFill || !timeEntryFill ||
      !root.chrome?.runtime?.onMessage) {
    return;
  }

  function isExtensionSender(sender) {
    return sender?.id === chrome.runtime.id;
  }

  /** Account from local storage; schedule from sync — never trust message payload for host binding. */
  async function loadCanonicalSettings() {
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

  function accountConfig(settings) {
    return {
      personio_subdomain: settings.personio_subdomain,
      employee_id: settings.employee_id
    };
  }

  async function assertPageAllowed() {
    const settings = await loadCanonicalSettings();
    personioConfig.validateAccountSettings(settings);
    safety.assertAttendanceLocation(location.href, accountConfig(settings));
    return settings;
  }

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

  async function verifyCleared(dayNumber) {
    return safety.poll(() => {
      const rows = dom.extractDayRows(document);
      const row = dom.findRowByDay(rows, dayNumber);
      if (!row) return null;
      const state = dom.classifyRow(row);
      if (state.tracked && state.tracked.current === 0 && !state.approved && !state.pending) {
        return state;
      }
      return null;
    }, { timeoutMs: 6500, intervalMs: 200 });
  }

  async function dismissReviewModal(logger) {
    if (!dom.findReviewTimeEntriesModal(document)) return false;
    dom.dismissReviewTimeEntriesModal(document, click);
    logger.push('Dismissed "Review time entries" modal (Edit).');
    await safety.sleep(400);
    return true;
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

  async function fillSingleDay(dayNumber, settings, logger) {
    const rows = dom.extractDayRows(document);
    const row = dom.findRowByDay(rows, dayNumber);
    if (!row) throw new Error(`Day ${dayNumber} not found.`);
    const currentState = dom.classifyRow(row);

    if (!dom.isFillCandidate(currentState)) {
      logger.push(`Skip ${row.dayLabel}: not a fill candidate.`);
      return false;
    }

    await dismissReviewModal(logger);

    const form = await openEditorForRow(row, logger);
    const periods = timeModel.derivePeriods(settings);
    if (!timeModel.validatePeriods(periods)) throw new Error('Derived periods are invalid.');

    await timeEntryFill.fillWorkBreakWorkForm(form, periods, fillDeps(logger));

    const saveButton = dom.getSaveButton(form);
    if (!saveButton) throw new Error(`Save button missing in ${row.dayLabel}.`);
    click(saveButton);
    logger.push(`Save clicked for ${row.dayLabel}`);
    await safety.sleep(500);

    if (dom.findReviewTimeEntriesModal(document)) {
      await dismissReviewModal(logger);
      await closeDayEditor(row, logger);
      throw new Error(`${row.dayLabel}: validation modal — fix or clear day and retry.`);
    }

    const saved = await verifySaved(dayNumber);
    if (!saved) {
      await closeDayEditor(row, logger);
      throw new Error(`Save not persisted for ${row.dayLabel} (still zero).`);
    }

    logger.push(`Saved ${row.dayLabel}: ${saved.tracked.label}`);
    await closeDayEditor(row, logger);
    return true;
  }

  async function runAutoFill() {
    const logger = safety.makeLogger();
    const settings = await assertPageAllowed();
    await ensureTimesheetReady(logger);

    const rows = dom.extractDayRows(document);
    const candidates = dom.collectFillCandidates(rows);
    const counts = {
      fillCandidates: candidates.length,
      locked: rows.length - candidates.length
    };

    logger.push(`Scan: fill_candidates=${counts.fillCandidates} (sorted day 1 → end of month)`);

    if (!candidates.length) {
      return { ok: true, summary: 'No unfilled editable days found.', logs: logger.all() };
    }

    let filledCount = 0;
    const errors = [];

    for (const { row, state } of candidates) {
      logger.push(`--- Fill day ${state.dayNumber} (${state.dayLabel}) ---`);
      try {
        const didFill = await fillSingleDay(state.dayNumber, settings, logger);
        if (didFill) filledCount += 1;
      } catch (error) {
        errors.push(`${state.dayLabel}: ${error.message}`);
        logger.push(`Error on ${state.dayLabel}: ${error.message}`);
      }
      await dismissReviewModal(logger);
      await safety.sleep(300);
    }

    const summary = `Auto fill done. Filled ${filledCount}/${candidates.length} day(s).`;
    if (errors.length) {
      logger.push(`Errors (${errors.length}):\n${errors.join('\n')}`);
    }

    return {
      ok: errors.length === 0,
      summary,
      filled: filledCount,
      total: candidates.length,
      logs: logger.all()
    };
  }

  async function runRevertDay(dayNumber) {
    const logger = safety.makeLogger();
    await assertPageAllowed();
    await ensureTimesheetReady(logger);

    const day = Number(dayNumber);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      throw new Error('Day must be an integer between 1 and 31.');
    }

    const rows = dom.extractDayRows(document);
    const row = dom.findRowByDay(rows, day);
    if (!row) {
      return { ok: false, message: `Day ${day} not found on this month view.`, logs: logger.all() };
    }

    const state = dom.classifyRow(row);
    if (state.locked || state.approved) {
      return {
        ok: true,
        summary: `${row.dayLabel} not editable (${state.locked ? 'locked' : 'approved'}).`,
        logs: logger.all()
      };
    }

    if (!state.tracked || state.tracked.current === 0) {
      return {
        ok: true,
        summary: `${row.dayLabel} is already empty.`,
        logs: logger.all()
      };
    }

    const form = await openEditorForRow(row, logger);
    const deleteButtons = dom.getDeleteButtons(form);
    if (!deleteButtons.length) {
      logger.push(`No period delete controls found for ${row.dayLabel}.`);
    }
    for (const button of deleteButtons) {
      click(button);
      logger.push(`Deleted period on ${row.dayLabel}.`);
      await safety.sleep(120);
    }

    const saveButton = dom.getSaveButton(form);
    if (!saveButton) {
      throw new Error(`Save button missing while clearing ${row.dayLabel}.`);
    }
    click(saveButton);
    logger.push(`Save clicked after clearing ${row.dayLabel}.`);

    const reverted = await verifyCleared(day);
    if (!reverted) {
      throw new Error(`${row.dayLabel} was not cleared to empty.`);
    }

    return {
      ok: true,
      summary: `${row.dayLabel} cleared (${reverted.tracked.label}).`,
      logs: logger.all()
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isExtensionSender(sender)) {
      return false;
    }

    const command = message?.command;
    if (!command || !ALLOWED_COMMANDS.has(command)) {
      return false;
    }

    const handler = (async () => {
      if (command === 'AUTO_FILL') return runAutoFill();
      if (command === 'REVERT_DAY') {
        const day = Number(message.dayNumber);
        if (!Number.isInteger(day) || day < 1 || day > 31) {
          return { ok: false, message: 'Invalid dayNumber.' };
        }
        return runRevertDay(day);
      }
      return { ok: false, message: `Unsupported command: ${command}` };
    })();

    handler
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, message: error.message }));

    return true;
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
