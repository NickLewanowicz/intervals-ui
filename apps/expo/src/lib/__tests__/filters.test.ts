import { describe, expect, it } from 'vitest';
import {
  calendarWindowFilter,
  chatMessagesFilter,
  sportSettingsFilter,
  syncStateFilter,
  wellnessFilter,
} from '../filters';

describe('calendarWindowFilter', () => {
  it('bounds start_date_local to the inclusive day window', () => {
    expect(calendarWindowFilter('u1', '2026-10-19', '2026-10-25')).toBe(
      'user = "u1" && start_date_local >= "2026-10-19T00:00:00" && start_date_local <= "2026-10-25T23:59:59"',
    );
  });

  it('keeps an event at 23:59:59 on the last day and drops the next morning', () => {
    const f = calendarWindowFilter('u1', '2026-10-19', '2026-10-25');
    // string comparison — the mirror stores athlete-local "YYYY-MM-DDTHH:mm:ss"
    expect('2026-10-25T23:59:59' >= f.match(/>= "([^"]+)"/)![1]!).toBe(true);
    expect('2026-10-25T23:59:59' <= f.match(/<= "([^"]+)"/)![1]!).toBe(true);
    expect('2026-10-26T00:00:00' <= f.match(/<= "([^"]+)"/)![1]!).toBe(false);
  });

  it('quotes the user id (PB filter grammar)', () => {
    expect(calendarWindowFilter('abc123', '2026-01-01', '2026-01-02')).toContain('user = "abc123"');
  });
});

describe('simple filters', () => {
  it('scopes by user / session respectively', () => {
    expect(wellnessFilter('u1')).toBe('user = "u1"');
    expect(syncStateFilter('u1')).toBe('user = "u1"');
    expect(chatMessagesFilter('s9')).toBe('session = "s9"');
    expect(sportSettingsFilter('u1')).toBe('user = "u1"');
  });
});
