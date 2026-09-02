// src/utils/queryParser.test.js
import { createFilterFunction, matchesAdvancedQuery } from './queryParser';

const log = {
  hostname: 'web-server-01',
  username: 'admin',
  status: 'ON_DISK',
  command: 'net user /domain',
  internal_ip: '192.168.1.5',
  notes: 'initial recon',
};

const adv = (query) => matchesAdvancedQuery(log, { mode: 'advanced', query });

describe('advanced query parser', () => {
  test('single field:value contains-match', () => {
    expect(adv('hostname:web')).toBe(true);
    expect(adv('hostname:nope')).toBe(false);
  });

  test('AND requires all', () => {
    expect(adv('hostname:web AND status:ON_DISK')).toBe(true);
    expect(adv('hostname:web AND status:CLEANED')).toBe(false);
  });

  test('OR requires any (regression: OR used to behave like AND)', () => {
    expect(adv('status:CLEANED OR hostname:web')).toBe(true);
    expect(adv('hostname:nope OR username:admin')).toBe(true);
    expect(adv('status:CLEANED OR status:REMOVED')).toBe(false);
  });

  test('AND binds tighter than OR', () => {
    // (CLEANED AND web) OR admin  ->  (false) OR true  -> true
    expect(adv('status:CLEANED AND hostname:web OR username:admin')).toBe(true);
    // web AND (CLEANED)  ... a OR (b AND c): nope OR (web AND ON_DISK) -> true
    expect(adv('hostname:nope OR hostname:web AND status:ON_DISK')).toBe(true);
    expect(adv('hostname:nope OR hostname:web AND status:CLEANED')).toBe(false);
  });

  test('NOT negates', () => {
    expect(adv('hostname:web NOT status:CLEANED')).toBe(true);
    expect(adv('hostname:web NOT status:ON_DISK')).toBe(false);
  });

  test('field aliases resolve', () => {
    expect(adv('user:admin')).toBe(true);
    expect(adv('ip:192.168')).toBe(true);
    expect(adv('host:web-server')).toBe(true);
  });

  test('quoted phrase matches as a substring (spaces preserved)', () => {
    expect(adv('cmd:"net user"')).toBe(true);
    expect(adv('command:"net nope"')).toBe(false);
    expect(adv('"initial recon"')).toBe(true); // all-fields phrase
  });

  test('bare term searches all fields', () => {
    expect(adv('web-server-01')).toBe(true);
    expect(adv('nonexistentvalue')).toBe(false);
  });

  test('incomplete queries match everything', () => {
    expect(adv('hostname:')).toBe(true);
    expect(adv('AND')).toBe(true);
    expect(adv('')).toBe(true);
  });
});

describe('createFilterFunction', () => {
  test('simple mode, all fields', () => {
    const f = createFilterFunction({ searchFilter: { mode: 'simple', query: 'web', field: 'all' } });
    expect(!!f(log)).toBe(true);
    const g = createFilterFunction({ searchFilter: { mode: 'simple', query: 'zzz', field: 'all' } });
    expect(!!g(log)).toBe(false);
  });

  test('simple mode, specific field', () => {
    const f = createFilterFunction({ searchFilter: { mode: 'simple', query: 'admin', field: 'username' } });
    expect(!!f(log)).toBe(true);
    const g = createFilterFunction({ searchFilter: { mode: 'simple', query: 'admin', field: 'hostname' } });
    expect(!!g(log)).toBe(false);
  });

  test('date range filter', () => {
    const dated = { ...log, timestamp: '2026-06-15T12:00:00Z' };
    const inRange = createFilterFunction({
      searchFilter: { mode: 'simple', query: '', field: 'all' },
      dateRange: { start: new Date('2026-06-01T00:00:00Z'), end: new Date('2026-06-30T00:00:00Z') },
    });
    expect(!!inRange(dated)).toBe(true);
    const after = createFilterFunction({
      searchFilter: { mode: 'simple', query: '', field: 'all' },
      dateRange: { start: new Date('2026-07-01T00:00:00Z'), end: null },
    });
    expect(!!after(dated)).toBe(false);
  });
});
