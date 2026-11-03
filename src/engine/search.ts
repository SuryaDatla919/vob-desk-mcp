// Plan documents: clause parsing, clause lookup and keyword retrieval.
// This is lexical keyword scoring over clause text. It is not RAG and uses no embeddings or model.

import type { Clause } from './types.ts';

const CLAUSE_HEADING = /^###\s+(§\d+(?:\.\d+)*)\s+(.+)$/;
const SECTION_HEADING = /^#{1,2}\s/;

/** Every `### §N.N Title` heading starts a clause; its text runs to the next heading. */
export function parsePlanDoc(planId: string, markdown: string): Clause[] {
  const clauses: Clause[] = [];
  let current: { clause_id: string; title: string; lines: string[] } | null = null;

  const flush = () => {
    if (current) {
      clauses.push({ plan_id: planId, clause_id: current.clause_id, title: current.title, text: current.lines.join('\n').trim() });
    }
    current = null;
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = CLAUSE_HEADING.exec(line);
    if (heading) {
      flush();
      current = { clause_id: heading[1]!, title: heading[2]!.trim(), lines: [] };
    } else if (SECTION_HEADING.test(line)) {
      flush();
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return clauses;
}

/** Accepts "§4.2", "4.2", "§ 4.2" or a full citation "SYN-PLAN-A §4.2". */
export function normalizeClauseId(input: string): string | null {
  const match = /(\d+(?:\.\d+)*)\s*$/.exec(input.trim());
  return match ? `§${match[1]}` : null;
}

export function findClause(clauses: Clause[], planId: string, clauseId: string): Clause | undefined {
  const id = normalizeClauseId(clauseId);
  return id ? clauses.find((c) => c.plan_id === planId && c.clause_id === id) : undefined;
}

// ---- Keyword retrieval -------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for', 'from', 'has', 'have',
  'how', 'i', 'if', 'in', 'is', 'it', 'its', 'my', 'of', 'on', 'or', 'plan', 'syn', 'the', 'this', 'to',
  'under', 'what', 'when', 'which', 'who', 'will', 'with',
]);

/** Lower-case words of 2+ characters, stop words removed, a trailing plural "s" stripped ("implants" -> "implant"). */
export function toTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word));
}

export interface SearchHit {
  citation: string;
  title: string;
  snippet: string;
  score: number;
}

/**
 * Score = for each distinct query term: 3 if it is in the clause title, plus its count in the
 * clause text (capped at 3). Ties keep document order. Returns at most `limit` hits with score > 0.
 */
export function searchClauses(clauses: Clause[], query: string, planId?: string, limit = 3): SearchHit[] {
  const queryTerms = [...new Set(toTerms(query))];
  if (queryTerms.length === 0) return [];

  const scored = clauses
    .filter((clause) => planId === undefined || clause.plan_id === planId)
    .map((clause, order) => {
      const titleTerms = new Set(toTerms(clause.title));
      const textTerms = toTerms(clause.text);
      let score = 0;
      for (const term of queryTerms) {
        if (titleTerms.has(term)) score += 3;
        score += Math.min(3, textTerms.filter((t) => t === term).length);
      }
      return { clause, order, score };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit);

  return scored.map(({ clause, score }) => ({
    citation: `${clause.plan_id} ${clause.clause_id}`,
    title: clause.title,
    snippet: snippetFor(clause.text, queryTerms),
    score,
  }));
}

/** The first sentence that contains a query term (or the first sentence), at most 200 characters. */
function snippetFor(text: string, queryTerms: string[]): string {
  const sentences = text.split(/(?<=\.)\s+/);
  const wanted = new Set(queryTerms);
  const best = sentences.find((sentence) => toTerms(sentence).some((t) => wanted.has(t))) ?? sentences[0] ?? '';
  return best.length > 200 ? `${best.slice(0, 197)}...` : best;
}
