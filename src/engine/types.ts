// Shared types for the benefits engine. Everything here describes synthetic demo data.

export type Status = 'VERIFIED' | 'NOT_VERIFIED' | 'NEEDS_HUMAN';

export type RuleId =
  | 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R06' | 'R07' | 'R08' | 'R09' | 'R10' | 'R11'
  | 'A01' | 'A02' | 'A03';

export type ProcedureClass = 'preventive' | 'basic' | 'major' | 'orthodontic' | 'cosmetic';

export interface ServiceRecord {
  procedure_id: string;
  date: string; // YYYY-MM-DD
}

export interface Member {
  member_id: string;
  dob: string;
  plan_id: string;
  effective_date: string;
  termination_date: string | null;
  deductible_met: number;
  annual_max_used: number;
  other_coverage: boolean;
  history: ServiceRecord[];
}

export interface Procedure {
  procedure_id: string;
  class: ProcedureClass;
  name: string;
}

export interface Provider {
  provider_id: string;
  name: string;
  status: 'active' | 'suspended';
}

export type FrequencyLimit =
  | { count: number; per: 'calendar_year' }
  | { count: number; per: 'months'; months: number };

/** Machine-readable plan terms. Every value names the clause it comes from (data/plans/terms.json). */
export interface PlanTerms {
  plan_id: string;
  name: string;
  document: string;
  eligibility_clause: string;
  deductible: { amount: number; clause: string };
  annual_max: { amount: number; clause: string };
  coinsurance: { clause: string; percent: Partial<Record<ProcedureClass, number>> };
  frequency: { clause: string; limits: Record<string, FrequencyLimit> };
  waiting_periods: Partial<Record<ProcedureClass, { months: number; clause: string }>>;
  age_limits: Record<string, { under_age: number; clause: string }>;
  excluded_classes: Partial<Record<ProcedureClass, string>>;
  excluded_procedures: Record<string, string>;
  predetermination_clause: string;
}

/** One numbered clause from a plan document, e.g. SYN-PLAN-B §4.2. */
export interface Clause {
  plan_id: string;
  clause_id: string; // e.g. "§4.2"
  title: string;
  text: string; // verbatim clause text
}

export interface DataSet {
  members: Member[];
  procedures: Procedure[];
  providers: Provider[];
  plans: Record<string, PlanTerms>;
  clauses: Clause[];
}

export interface BenefitRequest {
  request_ref: string;
  member_id: string;
  patient_dob: string;
  planned_date: string;
  procedures: string[];
  notes?: string; // stored and logged by the server, never read by the engine
}

export interface BatchInput {
  provider_id: string;
  requests: BenefitRequest[];
}

export interface Frequency {
  limit: number;
  used: number;
  remaining: number;
  /** null while a service is still available; otherwise the first date the limit allows one again. */
  next_eligible_date: string | null;
}

export interface ProcedureResult {
  procedure_id: string;
  covered_percent: number;
  frequency: Frequency | null; // null when the plan sets no frequency limit
  /** The date benefits for the class begin, only when the planned date is inside the waiting period. */
  waiting_period_ends: string | null;
  advisories: RuleId[];
  citations: string[]; // e.g. ["SYN-PLAN-B §4.1", "SYN-PLAN-B §4.2"]
}

export interface RowResult {
  request_ref: string;
  status: Status;
  member_ref: string; // masked, e.g. "SYN-****-01"
  plan_id: string | null;
  coverage_on_date: 'ACTIVE' | null;
  deductible_remaining: number | null;
  annual_max_remaining: number | null;
  procedures: ProcedureResult[];
  /** Every rule that fired for the row, in rule order (R01..R11, then A01..A03). */
  reasons: RuleId[];
  review_ticket: string | null;
}

export interface BatchResult {
  batch_id: string;
  /** Present only when the whole batch is rejected (R01, R02). */
  rejected?: true;
  reasons?: RuleId[];
  message?: string;
  counts: Record<Status, number>;
  results: RowResult[];
  disclaimer: string;
}
