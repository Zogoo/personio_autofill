(function initSpinFill(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PersonioSpinFill = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function factory() {
  'use strict';

  function normalizedText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function editableTarget(field) {
    if (!field) return null;
    if (field.matches?.('input,textarea,[contenteditable="true"]')) return field;
    return field.querySelector?.('input,textarea,[contenteditable="true"]') || field;
  }

  function interactionTarget(field) {
    if (field?.getAttribute?.('role') === 'spinbutton') return field;
    return editableTarget(field) || field;
  }

  function readFieldValue(field) {
    if (!field) return '';
    for (const node of [field, editableTarget(field)]) {
      if (!node) continue;
      if ('value' in node && typeof node.value === 'string' && node.value !== '') return node.value;
      const aria = node.getAttribute?.('aria-valuenow');
      if (aria != null && aria !== '') return String(aria);
      const text = normalizedText(node.textContent);
      if (text) return text;
    }
    return '';
  }

  function digitsOnly(value) {
    return String(value || '').replace(/[^\d]/g, '');
  }

  function fieldPart(field, index) {
    const testId = (field.getAttribute?.('data-test-id') || '').toLowerCase();
    const label = (field.getAttribute?.('aria-label') || '').toLowerCase();
    if (/minute|min\b/.test(testId) || /\bminutes?\b/.test(label)) return 'minute';
    if (/hour|hr\b/.test(testId) || /\bhours?\b/.test(label)) return 'hour';
    return index % 2 === 0 ? 'hour' : 'minute';
  }

  function isFieldUnfilled(field) {
    const digits = digitsOnly(readFieldValue(field));
    return digits === '' || /^0+$/.test(digits);
  }

  function valuesMatch(field, expected, part) {
    const actualDigits = digitsOnly(readFieldValue(field));
    const want = digitsOnly(expected).padStart(2, '0').slice(-2);
    if (!actualDigits) return false;

    if (part === 'hour') {
      return Number(actualDigits.slice(0, 2)) === Number(want);
    }

    return Number(actualDigits.slice(-2)) === Number(want);
  }

  function dispatchInputEvents(element, data) {
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertFromPaste',
      data: data || ''
    }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setNativeValue(target, value) {
    if ('value' in target) {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      ) || Object.getOwnPropertyDescriptor(target.constructor.prototype, 'value');
      if (descriptor?.set) descriptor.set.call(target, value);
      else target.value = value;
      return;
    }
    if (target.isContentEditable) {
      target.textContent = String(value);
      return;
    }
    target.textContent = String(value);
  }

  function fireKey(target, type, key) {
    const code = key.length === 1 && /\d/.test(key) ? `Digit${key}` : key;
    target.dispatchEvent(new KeyboardEvent(type, {
      key,
      code,
      bubbles: true,
      cancelable: true
    }));
  }

  function selectAll(target) {
    if (target.select && typeof target.select === 'function') {
      target.select();
      return;
    }
    const isMac = navigator.platform.toLowerCase().includes('mac');
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'a',
      code: 'KeyA',
      bubbles: true,
      cancelable: true,
      ctrlKey: !isMac,
      metaKey: isMac
    }));
    try {
      document.execCommand('selectAll', false, null);
    } catch (_err) {
      // ignore
    }
  }

  function click(el) {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.click();
  }

  function commitField(target, sleep) {
    fireKey(target, 'keydown', 'Tab');
    fireKey(target, 'keyup', 'Tab');
    target.blur?.();
    return sleep(150);
  }

  async function focusField(field, sleep) {
    const target = interactionTarget(field);
    click(field);
    target.focus?.();
    await sleep(120);
    return target;
  }

  async function writeWithPaste(target, text, sleep) {
    selectAll(target);
    await sleep(40);
    fireKey(target, 'keydown', 'Backspace');
    fireKey(target, 'keyup', 'Backspace');
    await sleep(40);

    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch (_err) {
      inserted = false;
    }
    if (!inserted) setNativeValue(target, text);
    dispatchInputEvents(target, text);
    await sleep(80);
  }

  async function writeDigitsSequential(target, text, sleep) {
    selectAll(target);
    await sleep(40);
    fireKey(target, 'keydown', 'Backspace');
    fireKey(target, 'keyup', 'Backspace');
    await sleep(40);

    for (const char of text) {
      fireKey(target, 'keydown', char);
      fireKey(target, 'keypress', char);
      dispatchInputEvents(target, char);
      fireKey(target, 'keyup', char);
      await sleep(90);
    }
    await sleep(60);
  }

  async function writeWithArrows(field, target, sleep, part) {
    const want = Number(digitsOnly(target));
    const interact = interactionTarget(field);
    let current = Number(digitsOnly(readFieldValue(field)));
    if (Number.isNaN(current)) current = 0;

    const maxSteps = part === 'hour' ? 24 : 60;
    let steps = 0;

    while (current !== want && steps < maxSteps) {
      if (current < want) {
        fireKey(interact, 'keydown', 'ArrowUp');
        fireKey(interact, 'keyup', 'ArrowUp');
      } else {
        fireKey(interact, 'keydown', 'ArrowDown');
        fireKey(interact, 'keyup', 'ArrowDown');
      }
      await sleep(45);
      current = Number(digitsOnly(readFieldValue(field)));
      if (Number.isNaN(current)) current = 0;
      steps += 1;
    }
    await sleep(60);
  }

  async function writeFieldValue(field, value, sleep, part) {
    const text = digitsOnly(value).padStart(2, '0').slice(-2);
    const target = interactionTarget(field);
    if (!target) return false;

    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      setNativeValue(target, text);
      dispatchInputEvents(target, text);
      target.blur?.();
      await sleep(100);
      return valuesMatch(field, text, part);
    }

    await focusField(field, sleep);

    const strategies = [
      () => writeWithPaste(target, text, sleep),
      () => writeDigitsSequential(target, text, sleep),
      () => writeWithArrows(field, text, sleep, part)
    ];

    for (const strategy of strategies) {
      await focusField(field, sleep);
      await strategy();
      await commitField(target, sleep);
      if (valuesMatch(field, text, part)) return true;
    }

    return valuesMatch(field, text, part);
  }

  async function fillSpinFields(fields, values, options) {
    const sleep = options?.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const log = options?.log || (() => {});
    let filled = 0;

    const count = Math.min(fields.length, values.length);
    for (let index = 0; index < count; index += 1) {
      const field = fields[index];
      const value = values[index];
      const part = fieldPart(field, index);

      const force = options?.force === true;
      if (!force && !isFieldUnfilled(field) && valuesMatch(field, value, part)) {
        log(`Skip spin ${index + 1}/${count}: already ${readFieldValue(field)}`);
        continue;
      }

      const ok = await writeFieldValue(field, value, sleep, part);
      if (!ok) {
        throw new Error(
          `Spin ${index + 1}/${count} (${part}): could not set "${value}" (reads "${readFieldValue(field)}")`
        );
      }
      filled += 1;
      log(`Filled spin ${index + 1}/${count} (${part}) = ${value}`);
    }

    return filled;
  }

  function allFieldsZero(fields) {
    return fields.every((field) => isFieldUnfilled(field));
  }

  return {
    editableTarget,
    interactionTarget,
    readFieldValue,
    fieldPart,
    isFieldUnfilled,
    valuesMatch,
    writeFieldValue,
    fillSpinFields,
    allFieldsZero
  };
});
