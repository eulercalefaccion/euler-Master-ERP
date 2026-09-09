/**
 * Utilidad global para habilitar la coma del teclado numérico en todo el sistema.
 * 
 * Problema:
 * En Windows con teclados en español latinoamericano, la tecla decimal del teclado numérico
 * emite el código 'NumpadDecimal' y el caracter '.'. En navegadores basados en Chromium
 * (Chrome/Edge) configurados en español, los inputs de tipo numérico (<input type="number">)
 * esperan exclusivamente una coma (',') como separador decimal y descartan silenciosamente
 * la pulsación del punto. Esto impide ingresar decimales desde el teclado numérico a menos
 * que el usuario use la coma del teclado alfanumérico común.
 * 
 * Solución:
 * Este manejador intercepta globalmente la tecla decimal del teclado numérico (y el punto en inputs
 * numéricos) e inserta el separador decimal correcto de forma nativa mediante execCommand('insertText'),
 * garantizando compatibilidad con componentes controlados de React y disparando los eventos
 * correspondientes de input/change.
 */

export function getLocaleDecimalSeparator() {
  try {
    const formatted = (1.1).toLocaleString();
    if (formatted.includes(',')) return ',';
    if (formatted.includes('.')) return '.';
  } catch {
    // Si falla la detección, en Argentina / ERP usamos coma
  }
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

export function handleNumpadDecimalKey(e) {
  const target = e.target;
  if (!target || !(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    return;
  }

  if (target.readOnly || target.disabled) {
    return;
  }

  const isNumberInput = target.type === 'number';
  const isEmailOrUrl = target.type === 'email' || target.type === 'url' || target.type === 'password';

  // No alterar campos de correo, enlaces o contraseñas donde el punto es un caracter literal
  if (isEmailOrUrl) {
    return;
  }

  const isNumpad = isDecimalKeyEvent(e);
  const isPeriodInNumber = isNumberInput && (e.key === '.' || e.key === ',');

  if (!isNumpad && !isPeriodInNumber) {
    return;
  }

  // Prevenir la acción por defecto (el descarte del navegador o el punto no deseado)
  e.preventDefault();

  const primarySep = isNumberInput ? getLocaleDecimalSeparator() : ',';

  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, primarySep);
    if (!inserted && isNumberInput) {
      const altSep = primarySep === ',' ? '.' : ',';
      inserted = document.execCommand('insertText', false, altSep);
    }
  } catch {
    inserted = false;
  }

  // Fallback para inputs de texto o textareas donde execCommand pudiera fallar
  if (!inserted && typeof target.selectionStart === 'number' && typeof target.selectionEnd === 'number') {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const val = target.value || '';
    const nextVal = val.slice(0, start) + primarySep + val.slice(end);

    const proto = target.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    if (setter) {
      setter.call(target, nextVal);
    } else {
      target.value = nextVal;
    }

    target.setSelectionRange(start + primarySep.length, start + primarySep.length);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export function initNumpadDecimalHandler() {
  if (typeof window === 'undefined') return;

  if (window.__numpadDecimalHandlerInitialized) {
    return;
  }
  window.__numpadDecimalHandlerInitialized = true;

  window.addEventListener('keydown', handleNumpadDecimalKey, true);
}
