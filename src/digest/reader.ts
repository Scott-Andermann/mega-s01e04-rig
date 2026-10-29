import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight } from './types.js';

type Run = {
  at: string;
  job: string;
  status: DigestRow['lastStatus'];
  owner: string | null;
  error?: string;
};

function isTimestamp(value: unknown): value is string {
  // Require a full timestamp with a zone, so ordering never depends on the server's TZ.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return false;
  if (!Number.isFinite(Date.parse(value))) return false;
  // Date.parse normalizes some impossible dates (e.g. February 30); reject those too.
  const date = value.slice(0, 10);
  return new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}

function isRun(value: unknown): value is Run {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return 'at' in value && isTimestamp(value.at)
    && 'job' in value && typeof value.job === 'string' && value.job.trim().length > 0
    && 'status' in value && (value.status === 'ok' || value.status === 'retry' || value.status === 'fail')
    && 'owner' in value && (typeof value.owner === 'string' || value.owner === null)
    && (!('error' in value) || typeof value.error === 'string');
}

// Latest owner/status/error come from the latest entry; an absent error clears lastError.
// Equal instants retain the first line's firstTime and the last line's latest fields.
export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night) || night.length !== 10) {
    throw new Error('Night must be a YYYY-MM-DD filename');
  }
  let content: string;
  try {
    content = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const jobs = new Map<string, DigestRow>();
  let badLines = 0;
  const lines = content.split('\n');
  // A final newline terminates the preceding record; it is not another blank record.
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      badLines++;
      continue;
    }
    if (!isRun(value)) {
      badLines++;
      continue;
    }

    const row = jobs.get(value.job);
    if (!row) {
      jobs.set(value.job, {
        job: value.job, owner: value.owner, runs: 1, retries: Number(value.status === 'retry'),
        lastStatus: value.status, lastError: value.error ?? null,
        firstTime: value.at, lastTime: value.at, hasFailure: value.status === 'fail',
      });
      continue;
    }
    row.runs++;
    row.retries += Number(value.status === 'retry');
    row.hasFailure ||= value.status === 'fail';
    const time = Date.parse(value.at);
    if (time < Date.parse(row.firstTime)) row.firstTime = value.at;
    if (time >= Date.parse(row.lastTime)) {
      row.lastTime = value.at;
      row.owner = value.owner;
      row.lastStatus = value.status;
      row.lastError = value.error ?? null;
    }
  }
  // Code-unit order is deterministic across locales, including mixed-case job names.
  const rows = [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return { rows, badLines };
};
