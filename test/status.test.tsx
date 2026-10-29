import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('ok 4 · retry 4 · fail 1');
    expect(html).toContain('ok 4 · retry 0 · fail 0');
  });

  it('links each night on disk to a digest that renders', async () => {
    const app = createApp(config);
    for (const night of ['2026-10-28', '2026-10-27']) {
      const response = await app.request(`/digest/${night}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(`digest · ${night}`);
    }
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
