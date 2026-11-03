// Loads the synthetic data set from data/. This is the only file outside server.ts that touches disk;
// src/engine/ stays pure.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePlanDoc } from './engine/search.ts';
import type { DataSet, Member, PlanTerms, Procedure, Provider } from './engine/types.ts';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export function loadData(root: string = REPO_ROOT): DataSet {
  const readJson = <T>(relative: string): T => JSON.parse(readFileSync(path.join(root, relative), 'utf8')) as T;

  const members = readJson<{ members: Member[] }>('data/members.json').members;
  const procedures = readJson<{ procedures: Procedure[] }>('data/procedures.json').procedures;
  const providers = readJson<{ providers: Provider[] }>('data/providers.json').providers;
  const terms = readJson<{ plans: Record<string, Omit<PlanTerms, 'plan_id'>> }>('data/plans/terms.json').plans;

  const plans: Record<string, PlanTerms> = {};
  for (const [planId, planTerms] of Object.entries(terms)) plans[planId] = { plan_id: planId, ...planTerms };

  const clauses = Object.values(plans).flatMap((plan) =>
    parsePlanDoc(plan.plan_id, readFileSync(path.join(root, 'data/plans', plan.document), 'utf8')),
  );

  return { members, procedures, providers, plans, clauses };
}
