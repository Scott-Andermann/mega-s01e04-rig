export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: 'ok' | 'retry' | 'fail';
  lastError: string | null;
  // Original log timestamps, including their offsets.
  firstTime: string;
  lastTime: string;
  // True if any run in the job's history failed, even if the last run succeeded.
  hasFailure: boolean;
};

export type NightDigest = {
  rows: DigestRow[];
  badLines: number;
};

// Contract for readNight in src/digest/reader.ts.
// A missing file returns null; an empty file returns an empty rows array.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
