// Governance as code: every exception and policy rule, with an ID and a plain-English description.
// verify.ts applies them; eval/cases.jsonl tests each one (data/EDGE_CASES.md maps members to rules).

import { addMonths, ageOn, daysBetween, yearOf } from './dates.ts';
import type { Frequency, FrequencyLimit, Member, RuleId, ServiceRecord } from './types.ts';

export interface Rule {
  id: RuleId;
  name: string;
  scope: 'batch' | 'row' | 'procedure' | 'advisory';
  description: string;
}

export const BATCH_LIMIT = 25;
export const PROCEDURE_LIMIT = 8;
export const TERMINATION_SOON_DAYS = 30;
export const ANNUAL_MAX_LOW_THRESHOLD = 200;

export const RULES: readonly Rule[] = [
  { id: 'R01', name: 'PROVIDER_UNKNOWN', scope: 'batch',
    description: 'The provider_id is not registered or not active. The whole batch is rejected and no row is processed (least privilege). Unknown and suspended providers get the same answer.' },
  { id: 'R02', name: 'BATCH_TOO_LARGE', scope: 'batch',
    description: `More than ${BATCH_LIMIT} rows. The whole batch is rejected with "split into batches of ${BATCH_LIMIT}".` },
  { id: 'R03', name: 'IDENTITY_MISMATCH', scope: 'row',
    description: 'The member ID and date of birth do not identify a member on file. NOT_VERIFIED with no plan data. An ID that is not on file gets the same answer, so a caller cannot probe which IDs exist.' },
  { id: 'R04', name: 'IDENTITY_AMBIGUOUS', scope: 'row',
    description: 'A subscriber ID with a date of birth matches two or more people on the contract (for example twins). NEEDS_HUMAN.' },
  { id: 'R05', name: 'COVERAGE_INACTIVE', scope: 'row',
    description: 'Coverage is not active on the planned date (terminated, or effective later). NOT_VERIFIED, reason only.' },
  { id: 'R06', name: 'OTHER_COVERAGE', scope: 'row',
    description: 'The member has other dental coverage, so a person must confirm which plan pays first (coordination of benefits). NEEDS_HUMAN.' },
  { id: 'R07', name: 'UNKNOWN_PROCEDURE', scope: 'row',
    description: 'A procedure ID is not in the catalog. NEEDS_HUMAN, and no data is returned for any procedure on the row.' },
  { id: 'R08', name: 'WAITING_PERIOD', scope: 'procedure',
    description: 'The procedure class is still in its waiting period on the planned date. covered_percent 0, with waiting_period_ends and a citation.' },
  { id: 'R09', name: 'FREQUENCY_EXHAUSTED', scope: 'procedure',
    description: 'The frequency limit is used up on the planned date. covered_percent 0, remaining 0, next_eligible_date and a citation.' },
  { id: 'R10', name: 'AGE_LIMIT', scope: 'procedure',
    description: 'The member is outside the age limit for the procedure on the planned date. covered_percent 0, with a citation.' },
  { id: 'R11', name: 'EXCLUDED', scope: 'procedure',
    description: 'The plan excludes the procedure. covered_percent 0, with a citation.' },
  { id: 'A01', name: 'TERMINATION_SOON', scope: 'advisory',
    description: `Coverage ends within ${TERMINATION_SOON_DAYS} days after the planned date. Added to covered procedures.` },
  { id: 'A02', name: 'ANNUAL_MAX_LOW', scope: 'advisory',
    description: `Less than $${ANNUAL_MAX_LOW_THRESHOLD} of the annual maximum remains. Added to covered procedures.` },
  { id: 'A03', name: 'PREDETERMINATION_SUGGESTED', scope: 'advisory',
    description: 'A covered major-class procedure: the plan recommends a predetermination. Cites the plan clause.' },
];

const RULE_ORDER: readonly RuleId[] = RULES.map((rule) => rule.id);

/** Deduplicates rule IDs and returns them in rule order. */
export function sortRules(ids: Iterable<RuleId>): RuleId[] {
  const seen = new Set(ids);
  return RULE_ORDER.filter((id) => seen.has(id));
}

// ---- Predicates used by verify.ts --------------------------------------------------------------

/** §1.1: active from the effective date through the termination date, inclusive. */
export function isActiveOn(member: Member, date: string): boolean {
  if (date < member.effective_date) return false;
  return member.termination_date === null || date <= member.termination_date;
}

/** A01 */
export function terminatesSoon(member: Member, date: string): boolean {
  return member.termination_date !== null && daysBetween(date, member.termination_date) <= TERMINATION_SOON_DAYS;
}

/** R08: the first covered date for the class, if `date` falls before it; otherwise null. */
export function waitingPeriodEnd(effectiveDate: string, months: number, date: string): string | null {
  const ends = addMonths(effectiveDate, months);
  return date < ends ? ends : null;
}

/** R10: the member must be under `underAge` on the date of service. */
export function outsideAgeLimit(dob: string, date: string, underAge: number): boolean {
  return ageOn(dob, date) >= underAge;
}

/** R09: frequency use as of the planned date (services after the planned date are ignored). */
export function frequencyOn(limit: FrequencyLimit, history: ServiceRecord[], procedureId: string, date: string): Frequency {
  const services = history.filter((s) => s.procedure_id === procedureId && s.date <= date);

  if (limit.per === 'calendar_year') {
    const year = yearOf(date);
    const used = services.filter((s) => yearOf(s.date) === year).length;
    const remaining = Math.max(0, limit.count - used);
    return { limit: limit.count, used, remaining, next_eligible_date: remaining === 0 ? `${year + 1}-01-01` : null };
  }

  // Month-based limit: a service counts until the same calendar day `months` later.
  const renewals = services
    .map((s) => addMonths(s.date, limit.months))
    .filter((renews) => date < renews)
    .sort();
  const used = renewals.length;
  const remaining = Math.max(0, limit.count - used);
  // When used up, a slot opens once enough counted services have renewed.
  const next = remaining === 0 ? renewals[used - limit.count] ?? null : null;
  return { limit: limit.count, used, remaining, next_eligible_date: next };
}
