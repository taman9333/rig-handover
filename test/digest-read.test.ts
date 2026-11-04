import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('gives 5 jobs sorted by job, 1 bad line, counts by line', () => {
    expect(night).not.toBeNull();
    expect(night!.night).toBe('2026-10-28');
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night!.badLines).toBe(1);
    expect(night!.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  const row = (job: string) => night!.rows.find((r) => r.job === job)!;

  it('counts every attempt and keeps the last error after a recovery', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps fail status, null owner, and times with their offset', () => {
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', runs: 1 });
    expect(row('digest/render')).toMatchObject({ owner: null, lastError: null, lastStatus: 'ok' });
    expect(row('lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (night: string, text: string) => writeFileSync(join(dir, `${night}.jsonl`), text);

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    write('2026-01-01', '');
    expect(readNight(dir, '../x')).toBeNull();
    expect(readNight(dir, '2026-01-01/../2026-01-01')).toBeNull();
    expect(readNight(dir, '2026-1-1')).toBeNull();
    expect(readNight(dir, '')).toBeNull();
  });

  it('reads an empty file (or only blank lines) as nothing ran', () => {
    const empty = { rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
    write('2026-01-01', '');
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', ...empty });
    write('2026-01-02', '\n  \n\n');
    expect(readNight(dir, '2026-01-02')).toEqual({ night: '2026-01-02', ...empty });
  });

  it('counts bad lines without throwing and still reads the rest', () => {
    const ok = { at: '2026-01-01T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' };
    const lines = [
      JSON.stringify(ok),
      '{"at":"2026-01-01T02:00:00+01:00","job":"a"', // truncated
      JSON.stringify({ ...ok, status: 'done' }), // unknown status
      JSON.stringify({ ...ok, owner: undefined }), // owner missing
      JSON.stringify({ ...ok, error: 5 }), // error not a string
      '42',
      '',
    ];
    write('2026-01-01', lines.join('\n'));
    const night = readNight(dir, '2026-01-01')!;
    expect(night.badLines).toBe(5);
    expect(night.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(night.rows).toHaveLength(1);
    expect(night.rows[0]).toMatchObject({ job: 'a', runs: 1, lastStatus: 'ok' });
  });

  it('keeps a row whose owner is null', () => {
    write('2026-01-01', JSON.stringify({ at: '2026-01-01T01:00:00-05:00', job: 'x', status: 'fail', owner: null, error: 'boom' }));
    expect(readNight(dir, '2026-01-01')!.rows).toEqual([
      {
        job: 'x',
        owner: null,
        runs: 1,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'boom',
        firstAt: '2026-01-01T01:00:00-05:00',
        lastAt: '2026-01-01T01:00:00-05:00',
      },
    ]);
  });
});
