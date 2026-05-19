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
