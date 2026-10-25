/**
 * PocketBase filter strings, built pure so the exact queries the screens run
 * are unit-testable and exercisable headlessly (tools + smoke scripts import
 * this file with zero RN/React dependencies).
 */

/** Events + activities whose start_date_local falls in the inclusive [from, to] ISO-date window. */
export function calendarWindowFilter(userId: string, from: string, to: string): string {
  return (
    `user = "${userId}" && ` +
    `start_date_local >= "${from}T00:00:00" && ` +
    `start_date_local <= "${to}T23:59:59"`
  );
}

/** The `days` most recent wellness rows for a user (newest first). */
export function wellnessFilter(userId: string): string {
  return `user = "${userId}"`;
}

/** The user's sync_state row (newest first). */
export function syncStateFilter(userId: string): string {
  return `user = "${userId}"`;
}

/** Chat messages of one session (oldest first). */
export function chatMessagesFilter(sessionId: string): string {
  return `session = "${sessionId}"`;
}

/** The mirror row of one upstream event (proposal before/after diffs). */
export function intervalsIdFilter(userId: string, intervalsId: number): string {
  return `user = "${userId}" && intervals_id = "${intervalsId}"`;
}
