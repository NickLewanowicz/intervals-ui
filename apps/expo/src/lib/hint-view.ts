/**
 * Pure keyboard + focus-guard logic for the Hint tooltip (parity-2 BUG #20 /
 * WCAG 2.1.2). Unit tested.
 *
 * While the bubble is open EVERY key dismisses it — Escape always works no
 * matter where focus sits, Tab always moves on, and the bubble never contains
 * focusable children so focus can never strand inside the modal.
 *
 * The only key exceptions are the trigger's own activation keys (Enter/Space):
 * their keydown must NOT pre-dismiss, or the trigger's press — which fires on
 * the same keystroke, after keydown — would instantly re-open the bubble the
 * key just closed (a close/reopen flicker). The trigger's own toggle handles
 * those two keys.
 */

/** Keys whose keydown must not pre-dismiss the open bubble (see above). */
const ACTIVATION_KEYS = new Set(['Enter', ' ']);

export function shouldDismissOnKey(key: string | null | undefined): boolean {
  if (key == null) return true; // unknown/legacy event — fail safe: dismiss
  return !ACTIVATION_KEYS.has(key);
}

/**
 * Reopen guard. react-native-web's Modal (ModalFocusTrap) refocuses the
 * trigger when the modal unmounts — which re-fires the trigger's onFocus and
 * instantly re-opens the bubble the user just dismissed. That close/reopen
 * cycle is the "Escape is dead" symptom from the a11y audit. hide() arms the
 * guard; the trigger's onFocus consults it and ignores refocus inside the
 * cooldown. A human re-focusing the trigger (tab away and back) always takes
 * longer than the cooldown.
 */
export const HINT_REOPEN_COOLDOWN_MS = 300;

/** Timestamp until which onFocus re-opens are ignored. */
export function armReopenGuard(now: number): number {
  return now + HINT_REOPEN_COOLDOWN_MS;
}

export function reopenAllowed(guardUntil: number, now: number): boolean {
  return now >= guardUntil;
}
