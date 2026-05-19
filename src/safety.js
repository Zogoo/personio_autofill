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
