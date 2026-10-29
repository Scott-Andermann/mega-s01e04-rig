import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('digest JSON endpoint', () => {
  it('returns the reader digest in the same sorted row order, including bad lines', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-json-'));
    dirs.push(runsDir);
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      JSON.stringify({ at: '2026-10-28T02:00:00+01:00', job: 'z/job', status: 'ok', owner: null }),
      JSON.stringify({ at: '2026-10-28T01:00:00+01:00', job: 'a/job', status: 'retry', owner: 'rook' }),
      '{bad line',
    ].join('\n'));

    const response = await createApp({
      adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir,
    }).request('/api/digest/2026-10-28');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      rows: [
        {
          job: 'a/job', owner: 'rook', runs: 1, retries: 1, lastStatus: 'retry', lastError: null,
          firstTime: '2026-10-28T01:00:00+01:00', lastTime: '2026-10-28T01:00:00+01:00', hasFailure: false,
        },
        {
          job: 'z/job', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstTime: '2026-10-28T02:00:00+01:00', lastTime: '2026-10-28T02:00:00+01:00', hasFailure: false,
        },
      ],
      badLines: 1,
    });
  });
});
