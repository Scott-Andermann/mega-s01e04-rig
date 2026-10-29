import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const runsDirs: string[] = [];
afterEach(() => {
  for (const runsDir of runsDirs.splice(0)) rmSync(runsDir, { recursive: true, force: true });
});

function appWithRuns() {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  runsDirs.push(runsDir);
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

describe('digest routes', () => {
  it('serves both endpoints and keeps HTML job order aligned with JSON', async () => {
    const app = appWithRuns();
    const runsDir = runsDirs.at(-1)!;
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      JSON.stringify({ at: '2026-10-28T04:00:00-04:00', job: 'z/last', status: 'ok', owner: null }),
      JSON.stringify({ at: '2026-10-28T01:00:00+01:00', job: 'a/first', status: 'ok', owner: 'rook' }),
    ].join('\n'));

    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    const html = await htmlResponse.text();
    const json = await jsonResponse.json() as {
      rows: Array<{ job: string; owner: string | null; firstTime: string; lastTime: string }>;
      badLines: number;
    };

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    const htmlJobs = [...html.matchAll(/<tr>\s*<td>([^<]+)<\/td>/g)].map((match) => match[1]);
    expect(htmlJobs).toEqual(json.rows.map(({ job }) => job));
    expect(htmlJobs).toEqual(['a/first', 'z/last']);
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('2026-10-28T04:00:00-04:00');
    expect(json.rows[1]).toMatchObject({
      owner: null,
      firstTime: '2026-10-28T04:00:00-04:00',
      lastTime: '2026-10-28T04:00:00-04:00',
    });
    expect(json.badLines).toBe(0);
  });

  it('returns 404 from both endpoints when the night file is absent', async () => {
    const app = appWithRuns();
    const responses = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([404, 404]);
  });

  it('serves an empty night as a message and empty JSON rows', async () => {
    const app = appWithRuns();
    writeFileSync(join(runsDirs.at(-1)!, '2026-10-28.jsonl'), '');

    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    const html = await htmlResponse.text();
    const json = await jsonResponse.json();

    expect(htmlResponse.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(json).toEqual({ rows: [], badLines: 0 });
  });

  it('counts malformed lines while serving valid rows from both endpoints', async () => {
    const app = appWithRuns();
    writeFileSync(join(runsDirs.at(-1)!, '2026-10-28.jsonl'), [
      JSON.stringify({ at: '2026-10-28T05:41:09+01:00', job: 'lane/sync', status: 'ok', owner: null }),
      '{broken json',
    ].join('\n'));

    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    const html = await htmlResponse.text();
    const json = await jsonResponse.json() as { rows: Array<{ job: string }>; badLines: number };

    expect(htmlResponse.status).toBe(200);
    expect(html).toContain('bad lines: 1');
    expect(html).toContain('lane/sync');
    expect(jsonResponse.status).toBe(200);
    expect(json).toMatchObject({ badLines: 1, rows: [{ job: 'lane/sync' }] });
  });
});
