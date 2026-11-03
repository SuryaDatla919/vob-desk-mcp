// The deterministic benefits engine. Pure: no I/O, no clock, no randomness.
// The server passes the batch ID in; every date comes from the request (planned_date).
// The LLM never computes coverage. Every number an agent shows must come from this output.

import { maskMemberId, normalizeMemberId } from './mask.ts';
import {
  ANNUAL_MAX_LOW_THRESHOLD,
  BATCH_LIMIT,
  frequencyOn,
  isActiveOn,
  outsideAgeLimit,
  sortRules,
  terminatesSoon,
  waitingPeriodEnd,
} from './rules.ts';
import type {
  BatchInput,
  BatchResult,
  BenefitRequest,
  DataSet,
  Frequency,
  Member,
  PlanTerms,
  Procedure,
  ProcedureResult,
  RowResult,
  RuleId,
  Status,
} from './types.ts';

export const DISCLAIMER = 'Synthetic demo. Benefit information is not a guarantee of payment.';

export interface VerifyOptions {
  /** Supplied by the caller (the server generates one per call) so the engine stays deterministic. */
  batchId: string;
}

export function verifyBatch(input: BatchInput, data: DataSet, options: VerifyOptions): BatchResult {
  const { batchId } = options;

  // R01: least privilege. Unknown and suspended providers get the same answer.
  const provider = data.providers.find((p) => p.provider_id === input.provider_id);
  if (!provider || provider.status !== 'active') {
    return rejectBatch(batchId, 'R01', 'provider_id is not registered or not active. No rows were processed.');
  }

  // R02: the schema already caps a batch at 25 rows; the engine enforces it again for direct callers.
  if (input.requests.length > BATCH_LIMIT) {
    return rejectBatch(
      batchId,
      'R02',
      `The batch has ${input.requests.length} rows and the limit is ${BATCH_LIMIT}: split into batches of ${BATCH_LIMIT}. No rows were processed.`,
    );
  }

  const catalog = new Map(data.procedures.map((p) => [p.procedure_id, p]));
  const results = input.requests.map((request, index) => verifyRow(request, index, data, catalog, batchId));

  const counts: Record<Status, number> = { VERIFIED: 0, NOT_VERIFIED: 0, NEEDS_HUMAN: 0 };
  for (const row of results) counts[row.status] += 1;

  return { batch_id: batchId, counts, results, disclaimer: DISCLAIMER };
}

function rejectBatch(batchId: string, rule: RuleId, message: string): BatchResult {
  return {
    batch_id: batchId,
    rejected: true,
    reasons: [rule],
    message,
    counts: { VERIFIED: 0, NOT_VERIFIED: 0, NEEDS_HUMAN: 0 },
    results: [],
    disclaimer: DISCLAIMER,
  };
}

// ---- Identity ----------------------------------------------------------------------------------

type Identity = { kind: 'resolved'; member: Member } | { kind: 'mismatch' } | { kind: 'ambiguous' };

/**
 * R03 / R04. An exact ID + DOB match wins. Offices often send the subscriber's ID (-01) with the
 * patient's DOB, so a subscriber ID is also matched against everyone on that contract:
 * one match resolves, two or more (twins) are ambiguous, none is a mismatch.
 * An ID that is not on file is reported exactly like a mismatch.
 */
export function resolveIdentity(memberId: string, dob: string, members: Member[]): Identity {
  const id = normalizeMemberId(memberId);
  const direct = members.find((m) => m.member_id === id);
  if (!direct) return { kind: 'mismatch' };
  if (direct.dob === dob) return { kind: 'resolved', member: direct };
  if (!id.endsWith('-01')) return { kind: 'mismatch' };

  const contract = id.slice(0, -2); // "SYN-1005-"
  const matches = members.filter((m) => m.member_id.startsWith(contract) && m.dob === dob);
  if (matches.length === 1) return { kind: 'resolved', member: matches[0]! };
  if (matches.length > 1) return { kind: 'ambiguous' };
  return { kind: 'mismatch' };
}

// ---- Rows --------------------------------------------------------------------------------------

function ticketFor(batchId: string, index: number): string {
  const suffix = batchId.startsWith('BATCH-') ? batchId.slice('BATCH-'.length) : batchId;
  return `TKT-${suffix}-${String(index + 1).padStart(2, '0')}`;
}

/** Data minimization: a row that is not VERIFIED carries no plan or coverage data at all. */
function withheld(request: BenefitRequest, memberRef: string, status: Status, reasons: RuleId[], ticket: string | null): RowResult {
  return {
    request_ref: request.request_ref,
    status,
    member_ref: memberRef,
    plan_id: null,
    coverage_on_date: null,
    deductible_remaining: null,
    annual_max_remaining: null,
    procedures: [],
    reasons: sortRules(reasons),
    review_ticket: ticket,
  };
}

function verifyRow(
  request: BenefitRequest,
  index: number,
  data: DataSet,
  catalog: Map<string, Procedure>,
  batchId: string,
): RowResult {
  // Note: request.notes is never read here. Free text is data, not instructions.
  const identity = resolveIdentity(request.member_id, request.patient_dob, data.members);
  if (identity.kind === 'mismatch') return withheld(request, maskMemberId(request.member_id), 'NOT_VERIFIED', ['R03'], null);
  if (identity.kind === 'ambiguous') {
    return withheld(request, maskMemberId(request.member_id), 'NEEDS_HUMAN', ['R04'], ticketFor(batchId, index));
  }

  const member = identity.member;
  const memberRef = maskMemberId(member.member_id);
  const date = request.planned_date;

  if (!isActiveOn(member, date)) return withheld(request, memberRef, 'NOT_VERIFIED', ['R05'], null);

  const needsHuman: RuleId[] = [];
  if (member.other_coverage) needsHuman.push('R06');
  if (request.procedures.some((id) => !catalog.has(id))) needsHuman.push('R07');
  if (needsHuman.length > 0) return withheld(request, memberRef, 'NEEDS_HUMAN', needsHuman, ticketFor(batchId, index));

  const plan = data.plans[member.plan_id];
  if (!plan) throw new Error(`Data error: member ${member.member_id} references unknown plan ${member.plan_id}`);

  const deductibleRemaining = Math.max(0, plan.deductible.amount - member.deductible_met);
  const annualMaxRemaining = Math.max(0, plan.annual_max.amount - member.annual_max_used);

  const fired: RuleId[] = [];
  const procedures = request.procedures.map((id) => {
    const evaluated = evaluateProcedure(catalog.get(id)!, member, plan, date, annualMaxRemaining);
    fired.push(...evaluated.fired);
    return evaluated.result;
  });

  return {
    request_ref: request.request_ref,
    status: 'VERIFIED',
    member_ref: memberRef,
    plan_id: plan.plan_id,
    coverage_on_date: 'ACTIVE',
    deductible_remaining: deductibleRemaining,
    annual_max_remaining: annualMaxRemaining,
    procedures,
    reasons: sortRules(fired),
    review_ticket: null,
  };
}

// ---- Procedures --------------------------------------------------------------------------------

/**
 * One procedure on a verified row. Order: exclusion (R11) ends the check; otherwise the
 * coinsurance clause applies and the frequency (R09), age (R10) and waiting-period (R08) rules can
 * each zero it. Advisories (A01-A03) are added only to procedures that stay covered.
 */
function evaluateProcedure(
  procedure: Procedure,
  member: Member,
  plan: PlanTerms,
  date: string,
  annualMaxRemaining: number,
): { result: ProcedureResult; fired: RuleId[] } {
  const id = procedure.procedure_id;

  const exclusion = plan.excluded_procedures[id] ?? plan.excluded_classes[procedure.class];
  if (exclusion) {
    return {
      result: { procedure_id: id, covered_percent: 0, frequency: null, waiting_period_ends: null, advisories: [], citations: cite(plan, [exclusion]) },
      fired: ['R11'],
    };
  }

  const percent = plan.coinsurance.percent[procedure.class];
  if (percent === undefined) throw new Error(`Data error: ${plan.plan_id} has no coinsurance for class ${procedure.class}`);

  const clauses: string[] = [plan.coinsurance.clause];
  const fired: RuleId[] = [];

  let frequency: Frequency | null = null;
  const limit = plan.frequency.limits[id];
  if (limit) {
    frequency = frequencyOn(limit, member.history, id, date);
    clauses.push(plan.frequency.clause);
    if (frequency.remaining === 0) fired.push('R09');
  }

  const age = plan.age_limits[id];
  if (age && outsideAgeLimit(member.dob, date, age.under_age)) {
    fired.push('R10');
    clauses.push(age.clause);
  }

  let waitingEnds: string | null = null;
  const waiting = plan.waiting_periods[procedure.class];
  if (waiting) {
    waitingEnds = waitingPeriodEnd(member.effective_date, waiting.months, date);
    if (waitingEnds) {
      fired.push('R08');
      clauses.push(waiting.clause);
    }
  }

  const coveredPercent = fired.length > 0 ? 0 : percent;

  const advisories: RuleId[] = [];
  if (coveredPercent > 0) {
    if (terminatesSoon(member, date)) {
      advisories.push('A01');
      clauses.push(plan.eligibility_clause);
    }
    if (annualMaxRemaining < ANNUAL_MAX_LOW_THRESHOLD) {
      advisories.push('A02');
      clauses.push(plan.annual_max.clause);
    }
    if (procedure.class === 'major') {
      advisories.push('A03');
      clauses.push(plan.predetermination_clause);
    }
  }

  return {
    result: {
      procedure_id: id,
      covered_percent: coveredPercent,
      frequency,
      waiting_period_ends: waitingEnds,
      advisories,
      citations: cite(plan, clauses),
    },
    fired: [...fired, ...advisories],
  };
}

/** "§4.1" -> "SYN-PLAN-A §4.1", deduplicated and in document order. */
function cite(plan: PlanTerms, clauses: string[]): string[] {
  return [...new Set(clauses)].sort(compareClauseIds).map((clause) => `${plan.plan_id} ${clause}`);
}

export function compareClauseIds(a: string, b: string): number {
  const pa = a.replace('§', '').split('.').map(Number);
  const pb = b.replace('§', '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
