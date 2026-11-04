// Plan morning-digest § 1. Types only: the reader (#2), the page, the JSON and the board link
// (§ 2) all build against this file.

/** The `status` of one line in `runs/<night>.jsonl`. */
export type LogStatus = 'ok' | 'retry' | 'fail';

/** One row per job for a night. Times are the log's own `at` strings, offset kept, never UTC. */
export type DigestRow = {
  job: string;
  /** `null` when the log says `owner: null`; the row is kept and views show `—`. */
  owner: string | null;
  /** Every log line for this job, so each attempt counts (an `ok` after two `retry` = 3). */
  runs: number;
  /** Lines for this job with status `retry`. */
  retries: number;
  /** Status of the job's latest line. */
  lastStatus: LogStatus;
  /** `error` of the job's latest line that carried one; `null` if none did. */
  lastError: string | null;
  /** `at` of the job's earliest line, as written in the log. */
  firstAt: string;
  /** `at` of the job's latest line, as written in the log. */
  lastAt: string;
};

/** One night's digest. An empty file gives `rows: []` ("nothing ran"), not `null`. */
export type Night = {
  /** `YYYY-MM-DD`, the file name without `.jsonl`. */
  night: string;
  /** Sorted by `job`. */
  rows: DigestRow[];
  /** Lines that did not parse or lacked a valid field: counted, never thrown. Blank lines don't count. */
  badLines: number;
  /** Parsed log lines per status, across all jobs (lines, not jobs). */
  counts: Record<LogStatus, number>;
};

/** Reads `<runsDir>/<night>.jsonl`. Returns `null` when the night has no file (the page answers 404). */
export type ReadNight = (runsDir: string, night: string) => Night | null;
