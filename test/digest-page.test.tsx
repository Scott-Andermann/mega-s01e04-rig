import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function configWithRuns() {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-page-'));
  dirs.push(runsDir);
  return { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };
}

describe('digest page', () => {
  it('renders digest fields, original timestamps, lane banner, bad-line count, and distinct markers', async () => {
    const config = configWithRuns();
    writeFileSync(join(config.runsDir, '2026-10-28.jsonl'), [
      ...Array.from({ length: 3 }, (_, index) => JSON.stringify({
        at: `2026-10-28T0${index + 1}:00:00+01:00`, job: 'z/retrying', status: 'retry', owner: null,
      })),
      JSON.stringify({ at: '2026-10-28T04:00:00-04:00', job: 'a/failed', status: 'fail', owner: 'rook', error: 'quota exceeded' }),
      '{bad line',
    ].join('\n'));
    process.env.LANE_MARKER = 'PAGE-TEST';

    const response = await createApp(config).request('/digest/2026-10-28');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('PAGE-TEST');
    expect(html).toContain('bad lines: 1');
    expect(html).toContain('last status');
    expect(html).toContain('last error');
    expect(html).toContain('—');
    expect(html).toContain('quota exceeded');
    expect(html).toContain('2026-10-28T04:00:00-04:00');
    expect(html).toContain('retry-mark');
    expect(html).toContain('failure-mark');
    expect(html.indexOf('a/failed')).toBeLessThan(html.indexOf('z/retrying'));
    expect(html).not.toMatch(/<script\b/i);
  });

  it('returns 404 for a malformed night parameter', async () => {
    const response = await createApp(configWithRuns()).request('/digest/not-a-date');
    expect(response.status).toBe(404);
  });

  it('renders the empty-night message', async () => {
    const config = configWithRuns();
    writeFileSync(join(config.runsDir, '2026-10-28.jsonl'), '');
    const response = await createApp(config).request('/digest/2026-10-28');
    expect(await response.text()).toContain('nothing ran');
  });
});
