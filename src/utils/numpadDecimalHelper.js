/**
 * Utilidad global para habilitar la coma del teclado numérico y manejo óptimo
 * de cuadros numéricos en todo el ERP.
 * 
 * Funcionalidades clave:
 * 1. Mapeo de tecla decimal: Al presionar el punto en el pad numérico (o teclado común en inputs numéricos),
 *    escribe la coma decimal ',' esperada por los usuarios.
 * 2. Borrado de cero: Si el campo tiene '0' y el usuario presiona Backspace/Delete, deja el campo vacío ('').
 * 3. Prevención de '033': Si el campo tiene '0' y el usuario escribe un dígito (1-9), sustituye el '0' por el dígito.
 * 4. Selección automática al foco: Al hacer clic o tab en cualquier input numérico, selecciona todo el texto
 *    para que al tipear se sobreescriba directamente sin concatenar ceros.
 */

export function getLocaleDecimalSeparator() {
  return ',';
}

export function isDecimalKeyEvent(e) {
  return (
    e.code === 'NumpadDecimal' ||
    e.keyCode === 110 ||
    e.which === 110 ||
    (e.location === 3 && (e.key === '.' || e.key === ','))
  );
}

export function isNumericInput(target) {
  if (!target || !(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return false;
  if (target.readOnly || target.disabled) return false;

  const type = (target.type || '').toLowerCase();
  const inputMode = (target.inputMode || '').toLowerCase();
  const name = (target.name || '').toLowerCase();
  const id = (target.id || '').toLowerCase();
  const placeholder = (target.placeholder || '').toLowerCase();

  return (
    type === 'number' ||
    inputMode === 'decimal' ||
    inputMode === 'numeric' ||
    target.classList?.contains('input-numeric') ||
    target.step !== '' ||
    target.min !== '' ||
    name.includes('cant') ||
    name.includes('precio') ||
    name.includes('qty') ||
    name.includes('amount') ||
    id.includes('cant') ||
    id.includes('precio') ||
    id.includes('qty') ||
    placeholder === '0' ||
    placeholder === '0.0' ||
    placeholder === '1'
  );
}

export function parseNumericValue(val, fallback = 0) {
  if (val === '' || val === null || val === undefined) return fallback;
  const str = typeof val === 'string' ? val.replace(',', '.') : String(val);
  const parsed = parseFloat(str);
  return isNaN(parsed) ? fallback : parsed;
}

export function insertTextAtCursor(target, textToInsert) {
  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, textToInsert);
  } catch {
    inserted = false;
  }

  if (inserted) {
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (target.type === 'number') {
    try {
      target.type = 'text';
      target.inputMode = 'decimal';
    } catch {}
  }

  const val = target.value || '';
  let start = target.selectionStart;
  let end = target.selectionEnd;

  if (typeof start !== 'number' || typeof end !== 'number') {
    start = val.length;
    end = val.length;
  }

  // Si se intenta insertar un separador decimal y ya existe uno
  if ((textToInsert === ',' || textToInsert === '.') && (val.includes(',') || val.includes('.'))) {
    const selected = val.slice(start, end);
    if (!selected.includes(',') && !selected.includes('.')) {
      return;
    }
  }

  const nextVal = val.slice(0, start) + textToInsert + val.slice(end);

  const proto = target.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

  if (setter) {
    setter.call(target, nextVal);
  } else {
    target.value = nextVal;
  }

  const newPos = start + textToInsert.length;
  try {
    target.setSelectionRange(newPos, newPos);
  } catch {}

  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
}

export function handleNumpadDecimalKey(e) {
  const target = e.target;
  if (!target || !(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    return;
  }

  if (target.readOnly || target.disabled) {
    return;
  }

  const isEmailOrUrl = target.type === 'email' || target.type === 'url' || target.type === 'password';
  if (isEmailOrUrl) {
    return;
  }

  const isNumeric = isNumericInput(target);

  // 1. Borrado de cero: si el valor es exactamente "0" y presiona Backspace o Delete, vaciar el campo
  if (isNumeric && (e.key === 'Backspace' || e.key === 'Delete') && target.value === '0') {
    e.preventDefault();
    if (target.type === 'number') {
      try {
        target.type = 'text';
        target.inputMode = 'decimal';
      } catch {}
    }
    const proto = target.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(target, '');
    } else {
      target.value = '';
    }
    try {
      target.setSelectionRange(0, 0);
    } catch {}
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  // 2. Prevención de "033": si el valor es "0" y escribe un dígito (1-9), sustituir el 0
  if (isNumeric && target.value === '0' && /^[1-9]$/.test(e.key)) {
    e.preventDefault();
    if (target.type === 'number') {
      try {
        target.type = 'text';
        target.inputMode = 'decimal';
      } catch {}
    }
    const proto = target.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(target, e.key);
    else target.value = e.key;
    try { target.setSelectionRange(1, 1); } catch {}
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  // 3. Tecla decimal del numpad o punto en campo numérico
  const isNumpad = isDecimalKeyEvent(e);
  const isPeriodInNumber = isNumeric && (e.key === '.' || e.key === ',');

  if (!isNumpad && !isPeriodInNumber) {
    return;
  }

  e.preventDefault();
  insertTextAtCursor(target, ',');
}

export function initNumpadDecimalHandler() {
  if (typeof window === 'undefined') return;

  if (window.__numpadDecimalHandlerInitialized) {
    return;
  }
  window.__numpadDecimalHandlerInitialized = true;

  // Interceptar teclas de numpad, decimal y borrado en captura para máxima prioridad
  window.addEventListener('keydown', handleNumpadDecimalKey, true);

  // Auto-seleccionar todo el contenido en inputs numéricos al hacer foco
  window.addEventListener('focusin', (e) => {
    const target = e.target;
    if (!target || target.tagName !== 'INPUT') return;
    if (target.readOnly || target.disabled) return;

    if (isNumericInput(target)) {
      if (target.type === 'number') {
        try {
          target.type = 'text';
          target.inputMode = 'decimal';
        } catch {}
      }

      setTimeout(() => {
        try {
          if (document.activeElement === target && typeof target.select === 'function') {
            target.select();
          }
        } catch {}
      }, 10);
    }
  }, true);
}
