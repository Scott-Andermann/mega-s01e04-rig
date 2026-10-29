import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
let runsDir: string;

beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-reader-')); });
afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

function writeLines(lines: unknown[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n'));
}

const run = { at: '2026-10-29T01:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' };

describe('readNight', () => {
  it('returns null for a missing file', () => {
    expect(readNight(runsDir, night)).toBeNull();
  });

  it('returns an empty digest for an empty file', () => {
    writeLines([]);
    expect(readNight(runsDir, night)).toEqual({ rows: [], badLines: 0 });
  });

  it('propagates IO errors other than a missing file', () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow(expect.objectContaining({ code: 'EISDIR' }));
  });

  it.each(['../2026-10-28', '/2026-10-28', '2026-10-28/child', '2026-10-28\\child', '', '..', '2026-10-28.jsonl', '2026-10-28\n', '2026-10-28\0'])('rejects unsafe night %j', (unsafe) => {
    expect(() => readNight(runsDir, unsafe)).toThrow();
  });
});

describe('aggregation', () => {
  it('reads the real night as five sorted jobs and one bad line', () => {
    expect(readNight('runs', night)).toEqual({
      badLines: 1,
      rows: [
        { job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstTime: '2026-10-29T05:41:09+01:00', lastTime: '2026-10-29T05:41:09+01:00', hasFailure: false },
        { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: null, firstTime: '2026-10-29T01:30:00+01:00', lastTime: '2026-10-29T01:37:00+01:00', hasFailure: false },
        { job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok', lastError: null, firstTime: '2026-10-28T23:00:06+01:00', lastTime: '2026-10-29T05:00:04+01:00', hasFailure: false },
        { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded', firstTime: '2026-10-29T04:00:01+01:00', lastTime: '2026-10-29T04:00:01+01:00', hasFailure: true },
        { job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstTime: '2026-10-28T23:00:02+01:00', lastTime: '2026-10-28T23:00:02+01:00', hasFailure: false },
      ],
    });
  });

  it('orders unsorted entries by instant, retaining offsets and historical failure', () => {
    writeLines([
      { ...run, at: '2026-10-29T01:00:00-04:00', owner: null },
      { ...run, at: '2026-10-29T03:00:00+02:00', status: 'retry', error: 'retrying' },
      { ...run, at: '2026-10-29T02:00:00+03:00', status: 'fail', error: 'broken' },
    ]);
    expect(readNight(runsDir, night)).toEqual({ badLines: 0, rows: [{
      job: 'lane/sync', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: null,
      firstTime: '2026-10-29T02:00:00+03:00', lastTime: '2026-10-29T01:00:00-04:00', hasFailure: true,
    }] });
  });

  it('breaks equal-instant ties by file order for first time and latest fields', () => {
    writeLines([
      { ...run, at: '2026-10-29T01:00:00+01:00', status: 'fail', error: 'old' },
      { ...run, at: '2026-10-29T00:00:00Z', status: 'retry', error: 'latest', owner: null },
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: 'lane/sync', owner: null, runs: 2, retries: 1, lastStatus: 'retry', lastError: 'latest',
      firstTime: '2026-10-29T01:00:00+01:00', lastTime: '2026-10-29T00:00:00Z', hasFailure: true,
    }]);
  });

  it('takes the latest entry error verbatim, including empty strings, or null when absent', () => {
    writeLines([
      { ...run, job: 'a', error: 'old' }, { ...run, job: 'a', status: 'fail' },
      { ...run, job: 'b', error: '' }, { ...run, job: 'c', error: 'diagnostic' },
    ]);
    expect(readNight(runsDir, night)?.rows.map(({ job, lastError }) => ({ job, lastError }))).toEqual([
      { job: 'a', lastError: null }, { job: 'b', lastError: '' }, { job: 'c', lastError: 'diagnostic' },
    ]);
  });

  it('sorts jobs deterministically and handles object-property names as ordinary jobs', () => {
    writeLines(['z', '__proto__', 'A', 'constructor', 'a'].map((job) => ({ ...run, job })));
    expect(readNight(runsDir, night)?.rows.map(({ job }) => job)).toEqual(['A', '__proto__', 'a', 'constructor', 'z']);
  });
});

describe('input validation', () => {
  it.each([
    null, [], 42, 'text', {},
    { ...run, at: undefined }, { ...run, at: 42 }, { ...run, at: 'invalid' },
    { ...run, at: '2026-02-30T00:00:00Z' }, { ...run, at: '2026-10-29' },
    { ...run, at: '2026-10-29T01:00:00' }, { ...run, at: '2026-10-29T24:00:00Z' },
    { ...run, job: undefined }, { ...run, job: 42 }, { ...run, job: '  ' },
    { ...run, status: undefined }, { ...run, status: 'unknown' },
    { ...run, owner: undefined }, { ...run, owner: 42 },
    { ...run, error: null }, { ...run, error: 42 },
  ].map((invalid) => [invalid]))('counts an invalid schema line and continues: %j', (invalid) => {
    writeLines([run, invalid, run]);
    expect(readNight(runsDir, night)).toEqual({ badLines: 1, rows: [{
      job: run.job, owner: 'rook', runs: 2, retries: 0, lastStatus: 'ok', lastError: null,
      firstTime: run.at, lastTime: run.at, hasFailure: false,
    }] });
  });

  it('counts malformed and blank lines without counting the final line terminator', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), `${JSON.stringify(run)}\r\n{broken\r\n\r\n  \r\n${JSON.stringify(run)}\r\n`);
    expect(readNight(runsDir, night)).toMatchObject({ badLines: 3, rows: [{ runs: 2 }] });
  });

  it('returns an empty digest with a count when every line is invalid', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), 'broken\nnull\n');
    expect(readNight(runsDir, night)).toEqual({ rows: [], badLines: 2 });
  });

  it('accepts fractional seconds, leap days and extra fields without changing timestamps', () => {
    writeLines([{ ...run, at: '2024-02-29T23:59:59.123Z', extra: true }]);
    expect(readNight(runsDir, night)).toMatchObject({ badLines: 0, rows: [{ firstTime: '2024-02-29T23:59:59.123Z', lastTime: '2024-02-29T23:59:59.123Z' }] });
  });
});
