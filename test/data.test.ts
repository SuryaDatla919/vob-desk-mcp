// Integrity checks on the synthetic data set: counts from the spec, the synthetic notice on every
// data file, plan terms that point at real clauses, and no strings shaped like real-world codes.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT, loadData } from '../src/data.ts';
import { RULES } from '../src/engine/rules.ts';

const NOTICE = 'SYNTHETIC: fictional data for a student demo.';
const data = loadData();
const read = (relative: string) => readFileSync(path.join(REPO_ROOT, relative), 'utf8');

function filesUnder(relative: string): string[] {
  return readdirSync(path.join(REPO_ROOT, relative), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(REPO_ROOT, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

const DATA_FILES = [...filesUnder('data'), ...filesUnder('demo'), ...filesUnder('eval')].filter((file) =>
  /\.(json|jsonl|csv|md)$/.test(file) && !file.endsWith('RESULTS.md'),
);

describe('synthetic data set', () => {
  it('matches the counts in the spec', () => {
    expect(data.members).toHaveLength(25);
    expect(data.procedures).toHaveLength(12);
    expect(data.providers.map((p) => p.provider_id)).toEqual(['PRV-01', 'PRV-02', 'PRV-03', 'PRV-04']);
    expect(data.providers.filter((p) => p.status === 'suspended')).toHaveLength(1);
    expect(Object.keys(data.plans)).toEqual(['SYN-PLAN-A', 'SYN-PLAN-B']);
    expect(new Set(data.members.map((m) => m.member_id)).size).toBe(25);
  });

  it.each(DATA_FILES)('%s starts with the synthetic notice', (file) => {
    const text = read(file);
    if (file.endsWith('.json')) expect(Object.entries(JSON.parse(text))[0]).toEqual(['_notice', NOTICE]);
    else if (file.endsWith('.jsonl')) expect(JSON.parse(text.split('\n')[0]!)).toEqual({ _notice: NOTICE });
    else if (file.endsWith('.csv')) expect(text.split(/\r?\n/)[0]).toBe(`# ${NOTICE}`);
    else expect(text.split(/\r?\n/)[0]).toBe(NOTICE);
  });

  it('contains no CDT-like codes (D + 4 digits) and no 10-digit numbers (NPI-like)', () => {
    for (const file of DATA_FILES) {
      const text = read(file);
      expect(text, file).not.toMatch(/\bD\d{4}\b/);
      expect(text, file).not.toMatch(/\b\d{10}\b/);
    }
  });

  it('every clause named in plans/terms.json exists in that plan document', () => {
    for (const plan of Object.values(data.plans)) {
      const named = [
        plan.eligibility_clause, plan.deductible.clause, plan.annual_max.clause, plan.coinsurance.clause,
        plan.frequency.clause, plan.predetermination_clause,
        ...Object.values(plan.waiting_periods).map((w) => w!.clause),
        ...Object.values(plan.age_limits).map((a) => a.clause),
        ...Object.values(plan.excluded_classes), ...Object.values(plan.excluded_procedures),
      ];
      const present = new Set(data.clauses.filter((c) => c.plan_id === plan.plan_id).map((c) => c.clause_id));
      for (const clause of named) expect(present, `${plan.plan_id} ${clause}`).toContain(clause);
    }
  });

  it('every procedure named in the plan terms or member history is in the catalog', () => {
    const catalog = new Set(data.procedures.map((p) => p.procedure_id));
    for (const plan of Object.values(data.plans)) {
      for (const id of [...Object.keys(plan.frequency.limits), ...Object.keys(plan.age_limits), ...Object.keys(plan.excluded_procedures)]) {
        expect(catalog, id).toContain(id);
      }
    }
    for (const member of data.members) for (const service of member.history) expect(catalog).toContain(service.procedure_id);
  });

  it('data/EDGE_CASES.md covers every member and every rule', () => {
    const table = read('data/EDGE_CASES.md');
    for (const member of data.members) expect(table, member.member_id).toContain(member.member_id);
    for (const rule of RULES) expect(table, rule.id).toContain(rule.id);
  });

  it('eval/cases.jsonl has the 40 cases in the categories the spec asks for', () => {
    const cases = read('eval/cases.jsonl').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((c) => !c._notice);
    const counts: Record<string, number> = {};
    for (const c of cases) counts[c.category] = (counts[c.category] ?? 0) + 1;
    expect(cases).toHaveLength(40);
    expect(counts).toEqual({
      routine: 10, frequency: 4, waiting_period: 4, inactive_coverage: 4, identity: 4,
      age_or_excluded: 4, other_coverage: 2, unknown_procedure: 2, provider_or_batch: 2, advisory: 4,
    });
  });
});
