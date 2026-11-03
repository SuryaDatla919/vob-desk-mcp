# Design decisions

## Core decisions

1. **Facts from code, words from the model.** Coverage, frequency, waiting periods, age limits, deductible and maximum come from a pure-function engine (`src/engine/`). The agent orchestrates and explains. It never computes a number, so it cannot invent a percentage, and every fact can be tested. The 40 engine cases check the engine directly, without a model in the loop.
2. **Why MCP.** The caller on the other side is an AI agent, not a person in a portal. MCP gives that agent a typed front door. Each tool has a strict input schema (1-25 rows, 1-8 procedures, `YYYY-MM-DD` dates) and a description that works as a contract: when to call it, what it never returns, and to quote numbers exactly. Results are compact JSON.
3. **Data minimization.**
   - Outputs carry a masked member ref (`SYN-****-02`), never the full ID, and no names exist anywhere.
   - NOT_VERIFIED and NEEDS_HUMAN rows carry no plan or coverage data, only rule IDs.
   - A member ID that is not on file gets exactly the same answer as a date-of-birth mismatch (R03), so a caller cannot probe which IDs exist.
   - An unknown provider and a suspended provider get the same rejection (R01).
4. **No CDT codes.** Real systems use the ADA's CDT procedure codes, which need an ADA license for any product use. The demo invents its own IDs (`PREV-EXAM`, `MAJOR-CROWN`, ...). The data tests reject anything shaped like a CDT code (`D` plus 4 digits) or a 10-digit, NPI-like number.
5. **Governance by exception.** Routine rows are answered. NEEDS_HUMAN rows (R04 twins, R06 other coverage, R07 unknown procedure) open a review ticket with reason codes. NOT_VERIFIED rows (R03 identity, R05 inactive) get no ticket, because the caller has to fix its own data first.
6. **Identity.** An exact member ID plus DOB match wins. Offices often know only the subscriber's ID, so a subscriber ID (`-01`) is also matched against everyone on that contract by DOB: one match resolves to that person, two or more (twins) go to a person (R04), and none is R03. A dependent's ID is never widened to the family.
7. **Rule order.**
   - Batch: R01, then R02.
   - Row: identity (R03/R04), then active coverage (R05), then R06 and R07 together.
   - Procedure: exclusion (R11) ends the check. Otherwise the coinsurance clause applies, and frequency (R09), age (R10) and waiting period (R08) can each set `covered_percent` to 0. Every rule that fires is cited.
   - Advisories (A01-A03) are added only to procedures that stay covered.
8. **Batch limits are enforced twice.** The schema caps a call at 25 rows and replies `R02 BATCH_TOO_LARGE: split into batches of 25`. The engine checks again for direct callers. A call rejected by the schema never reaches the handler, so it is not in the audit log. Calls the engine rejects (R01, R02) are logged.
9. **Deterministic by construction.** The engine reads no clock and no randomness. Dates come from `planned_date`, and the server passes the batch ID in. That is why the engine tests need no mocks.
10. **Keyword retrieval, not RAG.** `search_plan_docs` scores clause titles and text by keyword overlap, using no embeddings or model. Full clause text is loaded just in time through `get_plan_clause`, so a 25-row batch result stays small (citations only).
11. **Logs.** `logs/audit.jsonl` gets one line per verified row (with the notes text stored as data and `notes_ignored: true`) and one line per call to the other tools. `logs/review-queue.jsonl` gets one line per NEEDS_HUMAN row. Both are git-ignored. `demo/sample-audit.jsonl` is a committed sample, and the tests write to a temp folder.

## Simplifications (documented, not hidden)

- Frequency is counted per member, not per tooth.
- Deductible met and maximum used are one snapshot for the 2026 benefit year; they do not roll over at year end.
- `covered_percent` is the plan's coinsurance share. The deductible is reported separately, and no dollar estimates are made.
- The alternate-benefit clause (§8.1) is quoted but not calculated.
- `list_review_queue` returns every open ticket. With real authentication it would be scoped to the caller.
- Provider IDs are trusted strings. There is no authentication.

## Deviations from `docs/spec.md`

| Spec | What was built | Why |
|---|---|---|
| `.mcp.json` command `npx tsx src/server.ts` | `node --import tsx src/server.ts` | On native Windows, Claude Code needs a `cmd /c` wrapper to start `npx`. `node` with the tsx loader does the same thing on Windows, macOS and Linux. `npm start` still uses `tsx` |
| stdio transport via `server.connect(new StdioServerTransport())` | `serveStdio(createServer)` | The v2.4.0 SDK docs say a hand-wired transport serves only the 2025-era protocol, while `serveStdio` negotiates both eras. The integration test uses a 2025-11-25 `initialize` |
| MCP Inspector lists 4 tools | `test/server.test.ts` | An automated stdio test spawns the real server and runs `initialize`, `tools/list` (4 tools with schemas), the sample batch, and the other three tools. The SDK client is a separate package (`@modelcontextprotocol/client`), so the test has a small JSON-RPC client instead of a new dependency |
| 12 agent eval cases | 6 cases | Cut order step 2. One per category: CSV batch, free-text batch, plan question, identity trap, notes injection, payment promise |
| (stretch) `vob-auditor` subagent | not built | Cut order step 1 |
| Plan terms in the plan markdown | also `data/plans/terms.json` | The engine needs machine-readable terms. Every value names its clause, and `test/data.test.ts` checks that each clause exists |
| Engine files `types verify rules search mask` | plus `src/engine/dates.ts` and `src/data.ts` | Date math kept pure and separate; `data.ts` is the only loader that reads files |
| (not specified) | `test/data.test.ts` | Checks the spec's counts, the synthetic notice on every data file, and the CDT-like and NPI-like scans |
| Batch output shape | Rejected batches add `rejected`, `reasons` and `message` | The spec does not define how a rejected batch looks |
| (not specified) | The sample CSV has a `provider_id` column; procedures are `;`-separated | The spec does not say where a CSV's provider comes from |
| (not specified) | Each procedure ID at most once per row (schema check) | Duplicates would double-count against frequency limits |
| Tool output | JSON as text content; no `outputSchema` or `structuredContent` | Smaller surface for a demo. Claude Code reads the text block |
| Demo video | not made | Recording is a manual step |
| Agent eval command | Adds `--settings '{"disableAllHooks":true}'`, `--setting-sources project` and `--no-session-persistence` to the spec's flags | Isolates the runs from the host machine's own hooks, settings and session history |
| README problem statement: 1-2 vendor sources | 1 vendor source (Prosper AI) | It was the only one whose page text could be read and checked on Nov 3, 2026 |

## Packages

Pinned exactly (`.npmrc` has `save-exact=true`). The npm `repository` field was checked before installing, on Nov 3, 2026.

| Package | Version | npm `repository.url` | Matches the spec |
|---|---|---|---|
| `@modelcontextprotocol/server` | 2.4.0 | `git+https://github.com/modelcontextprotocol/typescript-sdk.git` | yes |
| `@modelcontextprotocol/core` (installed by the server package) | 2.4.0 | `git+https://github.com/modelcontextprotocol/typescript-sdk.git` | yes |
| `zod` | 4.6.7 | `git+https://github.com/colinhacks/zod.git` | yes |
| `tsx` | 4.23.15 | `git+https://github.com/privatenumber/tsx.git` | yes |
| `vitest` (dev) | 5.1.0 | `git+https://github.com/vitest-dev/vitest.git` | yes |

- Every pinned version existed, so no substitutions were needed.
- The MCP SDK v2 worked, so the v1 fallback (`@modelcontextprotocol/sdk@1.32.2`) was not used.
- `@modelcontextprotocol/inspector` was not installed; `test/server.test.ts` replaces the Inspector check.
- `tsx` is a runtime dependency because `.mcp.json` starts the server through its loader.

**Type checking.** The repo has no type-check script, because `typescript` and `@types/node` are not in the spec's package list. A one-time check ran from a separate folder with `typescript@7.0.2` (`github.com/microsoft/TypeScript`) and `@types/node@24.19.2` (`github.com/DefinitelyTyped/DefinitelyTyped`), using this repo's `tsconfig.json` (strict, `noUncheckedIndexedAccess`). It found 0 errors. To check locally, run `npm i -D --save-exact typescript @types/node`, then `npx tsc --noEmit`.
