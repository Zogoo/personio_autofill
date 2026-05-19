const test = require('node:test');
const assert = require('node:assert/strict');

const timeModel = require('../src/time-model.js');

test('derivePeriods returns Work-Break-Work with valid ordering', () => {
  const periods = timeModel.derivePeriods({
    workday_start: '09:00',
    workday_end: '18:00',
    break_minutes: 60
  });

  assert.equal(periods.length, 3);
  assert.equal(periods[0].type, 'Work');
  assert.equal(periods[1].type, 'Break');
  assert.equal(periods[2].type, 'Work');
  assert.equal(timeModel.validatePeriods(periods), true);
});

test('derivePeriods rejects invalid settings', () => {
  assert.throws(() => {
    timeModel.derivePeriods({
      workday_start: '18:00',
      workday_end: '09:00',
      break_minutes: 60
    });
  });
});

test('toSpinFieldValues creates flat HH/MM values', () => {
  const periods = [
    { type: 'Work', start: { hours: 9, minutes: 0 }, end: { hours: 13, minutes: 0 } },
    { type: 'Break', start: { hours: 13, minutes: 0 }, end: { hours: 14, minutes: 0 } },
    { type: 'Work', start: { hours: 14, minutes: 0 }, end: { hours: 18, minutes: 0 } }
  ];
  const values = timeModel.toSpinFieldValues(periods);
  assert.deepEqual(values, ['09', '00', '13', '00', '13', '00', '14', '00', '14', '00', '18', '00']);
});
