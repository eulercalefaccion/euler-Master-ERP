import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isDecimalKeyEvent,
  getLocaleDecimalSeparator,
  handleNumpadDecimalKey,
  initNumpadDecimalHandler,
  parseNumericValue,
} from './numpadDecimalHelper';

describe('numpadDecimalHelper', () => {
  describe('isDecimalKeyEvent', () => {
    it('detects NumpadDecimal by code', () => {
      expect(isDecimalKeyEvent({ code: 'NumpadDecimal' })).toBe(true);
    });

    it('detects NumpadDecimal by keyCode 110', () => {
      expect(isDecimalKeyEvent({ keyCode: 110 })).toBe(true);
      expect(isDecimalKeyEvent({ which: 110 })).toBe(true);
    });

    it('detects NumpadDecimal by location 3 and dot or comma', () => {
      expect(isDecimalKeyEvent({ location: 3, key: '.' })).toBe(true);
      expect(isDecimalKeyEvent({ location: 3, key: ',' })).toBe(true);
    });

    it('returns false for non-decimal keys', () => {
      expect(isDecimalKeyEvent({ code: 'KeyA', key: 'a' })).toBe(false);
      expect(isDecimalKeyEvent({ code: 'Digit1', key: '1' })).toBe(false);
      expect(isDecimalKeyEvent({ code: 'Enter', key: 'Enter' })).toBe(false);
    });
  });

  describe('getLocaleDecimalSeparator', () => {
    it('returns a comma or dot string', () => {
      const sep = getLocaleDecimalSeparator();
      expect([',', '.']).toContain(sep);
    });
  });

  describe('handleNumpadDecimalKey', () => {
    let mockExecCommand;

    beforeEach(() => {
      mockExecCommand = vi.fn().mockReturnValue(true);
      document.execCommand = mockExecCommand;
    });

    it('ignores non-input elements', () => {
      const div = document.createElement('div');
      const preventDefault = vi.fn();
      const event = { target: div, code: 'NumpadDecimal', preventDefault };

      handleNumpadDecimalKey(event);
      expect(preventDefault).not.toHaveBeenCalled();
      expect(mockExecCommand).not.toHaveBeenCalled();
    });

    it('ignores disabled or readonly inputs', () => {
      const input = document.createElement('input');
      input.disabled = true;
      const preventDefault = vi.fn();
      const event = { target: input, code: 'NumpadDecimal', preventDefault };

      handleNumpadDecimalKey(event);
      expect(preventDefault).not.toHaveBeenCalled();
    });

    it('ignores email and url inputs', () => {
      const input = document.createElement('input');
      input.type = 'email';
      const preventDefault = vi.fn();
      const event = { target: input, code: 'NumpadDecimal', preventDefault };

      handleNumpadDecimalKey(event);
      expect(preventDefault).not.toHaveBeenCalled();
    });

    it('intercepts NumpadDecimal on number inputs and calls execCommand with separator', () => {
      const input = document.createElement('input');
      input.type = 'number';
      const preventDefault = vi.fn();
      const event = { target: input, code: 'NumpadDecimal', key: '.', preventDefault };

      handleNumpadDecimalKey(event);
      expect(preventDefault).toHaveBeenCalled();
      expect(mockExecCommand).toHaveBeenCalledWith('insertText', false, expect.stringMatching(/[,.]/));
    });

    it('intercepts dot key on number inputs and converts it to decimal separator', () => {
      const input = document.createElement('input');
      input.type = 'number';
      const preventDefault = vi.fn();
      const event = { target: input, code: 'Period', key: '.', preventDefault };

      handleNumpadDecimalKey(event);
      expect(preventDefault).toHaveBeenCalled();
      expect(mockExecCommand).toHaveBeenCalled();
    });

    it('uses selection fallback if execCommand fails on text input', () => {
      mockExecCommand.mockReturnValue(false);
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.value = '100';
      input.selectionStart = 3;
      input.selectionEnd = 3;

      const dispatchSpy = vi.spyOn(input, 'dispatchEvent');
      const preventDefault = vi.fn();
      const event = { target: input, code: 'NumpadDecimal', key: '.', preventDefault };

      handleNumpadDecimalKey(event);
      expect(preventDefault).toHaveBeenCalled();
      expect(input.value).toBe('100,');
      expect(dispatchSpy).toHaveBeenCalled();
    });

    it('clears "0" when Backspace or Delete is pressed on numeric input', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.value = '0';
      const preventDefault = vi.fn();
      const event = { target: input, key: 'Backspace', preventDefault };

      handleNumpadDecimalKey(event);
      expect(preventDefault).toHaveBeenCalled();
      expect(input.value).toBe('');
    });

    it('replaces "0" with typed digit to prevent "033"', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.value = '0';
      const preventDefault = vi.fn();
      const event = { target: input, key: '3', preventDefault };

      handleNumpadDecimalKey(event);
      expect(preventDefault).toHaveBeenCalled();
      expect(input.value).toBe('3');
    });
  });

  describe('parseNumericValue', () => {
    it('correctly parses numbers with comma as decimal separator', () => {
      expect(parseNumericValue('10,5')).toBe(10.5);
      expect(parseNumericValue('0,75')).toBe(0.75);
    });

    it('correctly parses numbers with dot as decimal separator', () => {
      expect(parseNumericValue('10.5')).toBe(10.5);
    });

    it('returns fallback for empty string, null, undefined or NaN', () => {
      expect(parseNumericValue('')).toBe(0);
      expect(parseNumericValue(null)).toBe(0);
      expect(parseNumericValue(undefined)).toBe(0);
      expect(parseNumericValue('abc', 5)).toBe(5);
    });

    it('handles numeric numbers directly', () => {
      expect(parseNumericValue(42)).toBe(42);
      expect(parseNumericValue(0)).toBe(0);
    });
  });

  describe('initNumpadDecimalHandler', () => {
    it('attaches listener only once', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      window.__numpadDecimalHandlerInitialized = false;

      initNumpadDecimalHandler();
      expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);

      const countBefore = addSpy.mock.calls.length;
      initNumpadDecimalHandler();
      expect(addSpy.mock.calls.length).toBe(countBefore);
    });
  });
});
