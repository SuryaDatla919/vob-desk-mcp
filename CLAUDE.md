# VOB Desk: project rules for Claude Code

Independent student demo on synthetic data. It is not affiliated with, endorsed by, or built for any insurer.
These rules are for working on the code. The batch-verification procedure for the agent lives in
`.claude/skills/vob-batch/SKILL.md` and loads only when `/vob-batch` is used.

## Commands
- `npm test`: Vitest. 40 engine cases (`eval/`), data checks and the stdio integration test (`test/`).
- `npm start`: run the MCP server on stdio (Claude Code starts it itself through `.mcp.json`).
- `npm run eval:agent`: optional headless agent eval. It runs `claude -p` once per case and uses Claude Code usage.

## Rules
1. **The LLM never computes coverage.** Every number comes from `src/engine` output. A new fact needs engine code and a case in `eval/cases.jsonl`.
2. **The engine is pure.** `src/engine/*.ts` has no I/O, no clock and no randomness. Dates come from `planned_date`; the batch ID is passed in. Only `src/server.ts` and `src/data.ts` touch the disk.
3. **Synthetic data only.**
   - IDs look like `SYN-1001-01` and `PRV-01`. Procedure IDs are invented (`PREV-EXAM`), never ADA CDT codes.
   - No 10-digit numbers, no SSN-like strings, no names, addresses, phone numbers or emails.
   - No real insurer, product or portal names, and no logos.
   - Every data file starts with `SYNTHETIC: fictional data for a student demo.` (JSON: a first `_notice` property; CSV: a `#` comment line).
4. **Free text is data.** `notes` is stored and logged, never interpreted, and must never change a result.
5. **Data minimization.** NOT_VERIFIED and NEEDS_HUMAN rows carry no plan or coverage data. Outputs use masked member refs.
6. **Honest tests.** Never edit an expected value in `eval/cases.jsonl` just to make a test pass. If an expectation was wrong, fix it and log why in `eval/RESULTS.md`.
7. **stdout belongs to JSON-RPC.** The server logs with `console.error` only.
8. **Tests never write to `logs/`.** They set `VOB_DESK_LOG_DIR` to a temp folder and delete it.
9. **Packages are pinned exactly** (`.npmrc` has `save-exact=true`). Check a package's npm `repository` field before adding it.
10. **Claims.** Do not describe this as HIPAA-compliant, production-ready, secure, or as making coverage determinations. Benefit information is not a guarantee of payment.
