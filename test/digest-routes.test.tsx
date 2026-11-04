import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const good = [
  '{"at":"2026-10-29T01:30:00+01:00","job":"b/job","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-29T01:37:00+01:00","job":"b/job","status":"ok","owner":"rook"}',
  '{"at":"2026-10-29T04:00:01+01:00","job":"a/job","status":"fail","owner":null,"error":"quota exceeded"}',
];
const bad = '{"at":"2026-10-29T05:59:58+01:00","job":"lane/sy';

let runsDir: string;

function app() {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-runs-'));
  fs.writeFileSync(path.join(runsDir, '2026-10-29.jsonl'), good.join('\n') + '\n');
  fs.writeFileSync(path.join(runsDir, '2026-10-30.jsonl'), [good[0], bad, good[1], good[2]].join('\n') + '\n');
  fs.writeFileSync(path.join(runsDir, '2026-10-31.jsonl'), '');
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

describe('digest page GET /digest/:night', () => {
  it('renders an existing night with the lane banner, jobs sorted by job', async () => {
    const res = await app().request('/digest/2026-10-29');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('a/job');
    expect(html).toContain('b/job');
    expect(html.indexOf('a/job')).toBeLessThan(html.indexOf('b/job'));
  });

  it('returns 404 for a night with no file', async () => {
    const res = await app().request('/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for 2026-01-01');
  });

  it('renders "nothing ran" for an empty night', async () => {
    const res = await app().request('/digest/2026-10-31');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('shows the good jobs and the bad-line count for a night with a bad line', async () => {
    const res = await app().request('/digest/2026-10-30');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('a/job');
    expect(html).toContain('b/job');
    expect(html).toContain('1 line could not be read');
  });
});

describe('digest JSON GET /api/digest/:night', () => {
  it('returns { night, rows, badLines, counts } sorted by job', async () => {
    const res = await app().request('/api/digest/2026-10-29');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(Object.keys(body).sort()).toEqual(['badLines', 'counts', 'night', 'rows']);
    expect(body.night).toBe('2026-10-29');
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual([...jobs].sort());
    expect(jobs).toEqual(['a/job', 'b/job']);
  });

  it('returns 404 with an error body for a night with no file', async () => {
    const res = await app().request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: '2026-01-01' });
  });

  it('returns no rows and zero bad lines for an empty night', async () => {
    const res = await app().request('/api/digest/2026-10-31');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts the bad line and keeps the good rows', async () => {
    const res = await app().request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['a/job', 'b/job']);
  });
});

describe('page and JSON agree', () => {
  it('every JSON row appears in the page, in the same order', async () => {
    const json = (await (await app().request('/api/digest/2026-10-29')).json()) as Night;
    const html = await (await app().request('/digest/2026-10-29')).text();
    let last = -1;
    for (const row of json.rows) {
      const at = html.indexOf(row.job);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
  });
});
