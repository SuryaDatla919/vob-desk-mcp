// Runs the 40 engine cases in eval/cases.jsonl against the pure engine, then checks two
// invariants across every case: no data on non-verified rows (leakage) and a valid clause
// citation on every verified procedure (citation coverage).

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { loadData } from '../src/data.ts';
import type { BatchInput, BatchResult, RowResult } from '../src/engine/types.ts';
import { verifyBatch } from '../src/engine/verify.ts';

interface EngineCase {
  id: string;
  category: string;
  title: string;
  input: BatchInput;
  expect:
    | { row: RowResult }
    | { rejected: true; reasons: string[]; message_contains: string };
}

const BATCH_ID = 'BATCH-TEST0001';
const data = loadData();
const cases: EngineCase[] = readFileSync(new URL('./cases.jsonl', import.meta.url), 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line))
  .filter((entry) => !('_notice' in entry));

const run = (input: BatchInput): BatchResult => verifyBatch(input, data, { batchId: BATCH_ID });

describe('engine cases (eval/cases.jsonl)', () => {
  it.each(cases.map((c) => [`${c.id} [${c.category}] ${c.title}`, c] as const))('%s', (_label, c) => {
    const out = run(c.input);
    if ('rejected' in c.expect) {
      expect(out.rejected).toBe(true);
      expect(out.reasons).toEqual(c.expect.reasons);
      expect(out.message).toContain(c.expect.message_contains);
      expect(out.results).toEqual([]);
      return;
    }
    expect(out.rejected).toBeUndefined();
    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toEqual(c.expect.row);
  });
});

describe('invariants across all cases', () => {
  const rows = cases.flatMap((c) => run(c.input).results);
  const clauseIds = new Set(data.clauses.map((clause) => `${clause.plan_id} ${clause.clause_id}`));

  it('leakage: rows that are not VERIFIED carry no plan or coverage data (must be 0)', () => {
    const leaks = rows.filter(
      (r) =>
        r.status !== 'VERIFIED' &&
        (r.plan_id !== null || r.coverage_on_date !== null || r.deductible_remaining !== null ||
          r.annual_max_remaining !== null || r.procedures.length > 0),
    );
    console.log(`leakage: ${leaks.length} of ${rows.filter((r) => r.status !== 'VERIFIED').length} non-verified rows`);
    expect(leaks).toEqual([]);
  });

  it('citation coverage: every VERIFIED procedure cites at least one real clause', () => {
    const procedures = rows.filter((r) => r.status === 'VERIFIED').flatMap((r) => r.procedures);
    const cited = procedures.filter((p) => p.citations.length > 0 && p.citations.every((cite) => clauseIds.has(cite)));
    console.log(`citation coverage: ${cited.length}/${procedures.length} verified procedure rows`);
    expect(cited.length).toBe(procedures.length);
  });

  it('notes are data: the same row with and without notes gives the same answer', () => {
    const withNotes = cases.find((c) => c.input.requests.some((r) => r.notes))!;
    const withoutNotes: BatchInput = {
      ...withNotes.input,
      requests: withNotes.input.requests.map(({ notes: _ignored, ...rest }) => rest),
    };
    expect(run(withoutNotes)).toEqual(run(withNotes.input));
  });
});
