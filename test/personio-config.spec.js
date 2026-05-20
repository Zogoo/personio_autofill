const test = require('node:test');
const assert = require('node:assert/strict');

const cfg = require('../src/personio-config.js');

test('normalizeSubdomain accepts slug only', () => {
  assert.equal(cfg.normalizeSubdomain('example-corp'), 'example-corp');
});

test('normalizeSubdomain strips host suffix', () => {
  assert.equal(cfg.normalizeSubdomain('acme.app.personio.com'), 'acme');
});

test('normalizeSubdomain strips www prefix', () => {
  assert.equal(cfg.normalizeSubdomain('www.acme.app.personio.com'), 'acme');
});

test('normalizeSubdomain maps underscores to hyphens', () => {
  assert.equal(cfg.normalizeSubdomain('my_company'), 'my-company');
});

test('normalizeSubdomain strips attendance URL', () => {
  const url = 'https://acme.app.personio.com/attendance/employee/99?viewMode=monthly';
  assert.equal(cfg.normalizeSubdomain(url), 'acme');
});

test('buildAttendanceUrl uses configured host and employee', () => {
  const url = cfg.buildAttendanceUrl('acme', '12345', '2026-05-01');
  assert.equal(url, 'https://acme.app.personio.com/attendance/employee/12345?viewMode=monthly&startDate=2026-05-01');
});

test('isAttendanceUrl matches configured subdomain and employee', () => {
  const settings = { personio_subdomain: 'acme', employee_id: '12345' };
  const url = 'https://acme.app.personio.com/attendance/employee/12345?viewMode=monthly';
  assert.equal(cfg.isAttendanceUrl(url, settings), true);
  assert.equal(
    cfg.isAttendanceUrl('https://other.app.personio.com/attendance/employee/12345', settings),
    false
  );
});

test('isAttendanceUrl rejects non-https URLs', () => {
  const settings = { personio_subdomain: 'acme', employee_id: '12345' };
  const url = 'http://acme.app.personio.com/attendance/employee/12345?viewMode=monthly';
  assert.equal(cfg.isAttendanceUrl(url, settings), false);
});

test('assertAttendanceLocation rejects http', () => {
  assert.throws(() => {
    cfg.assertAttendanceLocation(
      'http://acme.app.personio.com/attendance/employee/1?viewMode=monthly',
      { personio_subdomain: 'acme', employee_id: '1' }
    );
  });
});

test('validateAccountSettings rejects empty subdomain', () => {
  assert.throws(() => cfg.validateAccountSettings({ personio_subdomain: '', employee_id: '1' }));
});

test('validateAccountSettings parses full attendance URL in subdomain field', () => {
  const url = 'https://acme.app.personio.com/attendance/employee/12345?viewMode=monthly';
  const account = cfg.validateAccountSettings({ personio_subdomain: url, employee_id: '' });
  assert.equal(account.personio_subdomain, 'acme');
  assert.equal(account.employee_id, '12345');
});
