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
