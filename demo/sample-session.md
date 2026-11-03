SYNTHETIC: fictional data for a student demo.

# Sample session: `/vob-batch demo/sample-batch.csv`

Real output from one run on Nov 3, 2026. Headless Claude Code (`claude -p`) with only the vob-desk MCP server and the `Read` tool allowed (4 turns, no permission denials). Only the markdown table, the exception list and the closing disclaimer line that Claude produced are kept; nothing in them was edited. The batch and ticket IDs are random per run.

| request_ref | procedure | status | covered % | remaining | citation |
|---|---|---|---|---|---|
| R-001 | PREV-EXAM | VERIFIED | 100 | 1 of 2 | SYN-PLAN-A §4.1, SYN-PLAN-A §4.2 |
| R-001 | PREV-CLEAN-ADULT | VERIFIED | 100 | 1 of 2 | SYN-PLAN-A §4.1, SYN-PLAN-A §4.2 |
| R-002 | BASIC-FILLING | VERIFIED | 70 | no limit | SYN-PLAN-B §4.1 |
| R-003 | - | NEEDS_HUMAN | - | - | - |
| R-004 | PREV-EXAM | VERIFIED | 100 | 1 of 2 | SYN-PLAN-A §4.1, SYN-PLAN-A §4.2 |
| R-004 | MAJOR-CROWN | VERIFIED | 0 | 1 of 1 | SYN-PLAN-A §4.1, SYN-PLAN-A §4.2, SYN-PLAN-A §5.2 |
| R-005 | - | NEEDS_HUMAN | - | - | - |
| R-006 | PREV-FLUORIDE-CHILD | VERIFIED | 100 | 1 of 2 | SYN-PLAN-A §4.1, SYN-PLAN-A §4.2 |
| R-006 | PREV-SEALANT | VERIFIED | 100 | 1 of 1 | SYN-PLAN-A §4.1, SYN-PLAN-A §4.2 |
| R-007 | - | NOT_VERIFIED | - | - | - |
| R-008 | MAJOR-ROOT-CANAL | VERIFIED | 50 | no limit | SYN-PLAN-A §4.1, SYN-PLAN-A §9.1 |
| R-009 | PREV-CLEAN-ADULT | VERIFIED | 100 | 1 of 2 | SYN-PLAN-B §4.1, SYN-PLAN-B §4.2 |
| R-010 | PREV-BITEWING | VERIFIED | 100 | 1 of 1 | SYN-PLAN-A §4.1, SYN-PLAN-A §4.2 |
| R-010 | BASIC-EXTRACTION | VERIFIED | 80 | no limit | SYN-PLAN-A §4.1 |

## Exceptions

**NEEDS_HUMAN**
- **R-003** — R04 IDENTITY_AMBIGUOUS (the ID and date of birth match more than one person). Review ticket: **TKT-015F9CCF-03**
- **R-005** — R06 OTHER_COVERAGE (other dental coverage; a person must confirm which plan pays first). Review ticket: **TKT-015F9CCF-05**

**NOT_VERIFIED**
- **R-007** — R03 IDENTITY_MISMATCH (the member ID and date of birth did not identify a member on file). The office can re-check the member ID and the patient date of birth it sent for this row and resubmit. No member details are returned for this status.

Synthetic demo. Benefit information is not a guarantee of payment.
