/**
 * Hint keyboard + focus-guard logic (parity-2 BUG #20 / WCAG 2.1.2): the open
 * bubble dismisses on ANY key (Escape always works, Tab always moves on and
 * can never strand focus in the modal) except the trigger's own activation
 * keys, and the reopen guard stops the Modal's refocus-on-unmount from
 * instantly re-opening a just-dismissed bubble.
 */
import { describe, expect, it } from 'vitest';
import {
  HINT_REOPEN_COOLDOWN_MS,
  armReopenGuard,
  reopenAllowed,
  shouldDismissOnKey,
} from '../hint-view';

describe('shouldDismissOnKey', () => {
  it('Escape dismisses — always', () => {
    expect(shouldDismissOnKey('Escape')).toBe(true);
  });

  it('Tab dismisses — focus can never strand in the bubble', () => {
    expect(shouldDismissOnKey('Tab')).toBe(true);
    expect(shouldDismissOnKey('Shift')).toBe(true); // Shift+Tab prefix
  });

  it('any other key dismisses (tooltip semantics)', () => {
    expect(shouldDismissOnKey('a')).toBe(true);
    expect(shouldDismissOnKey('ArrowDown')).toBe(true);
    expect(shouldDismissOnKey('Home')).toBe(true);
  });

  it('unknown / missing key dismisses (fail safe)', () => {
    expect(shouldDismissOnKey(undefined)).toBe(true);
    expect(shouldDismissOnKey(null)).toBe(true);
    expect(shouldDismissOnKey('')).toBe(true);
  });

  it('the trigger activation keys do NOT pre-dismiss (toggle handles them)', () => {
    expect(shouldDismissOnKey('Enter')).toBe(false);
    expect(shouldDismissOnKey(' ')).toBe(false);
  });
});

describe('reopen guard', () => {
  it('refocus inside the cooldown is ignored (ModalFocusTrap refocus-on-close)', () => {
    const until = armReopenGuard(1000);
    expect(until).toBe(1000 + HINT_REOPEN_COOLDOWN_MS);
    expect(reopenAllowed(until, 1000 + 5)).toBe(false);
  });

  it('a human re-focus after the cooldown re-opens the hint', () => {
    const until = armReopenGuard(1000);
    expect(reopenAllowed(until, 1000 + HINT_REOPEN_COOLDOWN_MS)).toBe(true);
    expect(reopenAllowed(until, 5000)).toBe(true);
  });

  it('no guard armed → focus always allowed', () => {
    expect(reopenAllowed(0, 0)).toBe(true);
  });
});
