SYNTHETIC: fictional data for a student demo.

# Edge cases: which member exists for which rule

Every member below is invented. This table is the business-requirements view of the test data: each row says what situation a member represents, which rule it should trigger, and where it is used. `E##` are engine cases in `eval/cases.jsonl`; `R-0##` are rows of `demo/sample-batch.csv`. Rule definitions live in `src/engine/rules.ts`.

## Members

| Member | Plan | Situation | Rule(s) it should fire | Used in |
|---|---|---|---|---|
| SYN-1001-01 | A | Routine adult; exam, cleaning and bitewing already done once this year | none (routine); R11 when whitening is asked for | E01, E29, E35, E36, R-001 |
| SYN-1001-02 | A | Child dependent, age 11; reachable by her own ID or by the subscriber ID plus her DOB | none (routine) | E03, E08, R-006 |
| SYN-1002-01 | B | Routine adult on Plan B (basic 70%); implants excluded on Plan B | none; R11 for an implant; R07 for an unknown ID | E02, E06, E30, E33, R-002 |
| SYN-1003-01 | A | Effective 2026-03-01, so major services wait until 2027-03-01 | R08 (crown) | E15, R-004 |
| SYN-1004-01 | B | Has other dental coverage | R06 | E31, R-005 |
| SYN-1004-02 | B | Has other dental coverage | R06 (with R07 when an unknown ID is sent) | E32 |
| SYN-1005-01 | A | Subscriber of a family with twins; deductible met | none for himself; R04 when his ID is sent with the twins' DOB | E07, E25, R-003 |
| SYN-1005-02 | A | Twin A, same DOB as twin B | R04 when reached through the subscriber ID | E25 |
| SYN-1005-03 | A | Twin B; unambiguous when her own ID is used | none | E26 |
| SYN-1006-01 | B | Routine adult; the sample batch sends a wrong DOB | R03 (DOB mismatch) | E09, E23, R-007 |
| SYN-1007-01 | A | Long-time member; root canal and implants covered at 50% | A03 (major procedure); R07 for an unknown ID | E34, E39, R-008 |
| SYN-1008-01 | B | Routine adult; the sample row carries a prompt injection in notes | none: notes are data | E05, R-009 |
| SYN-1009-01 | A | Bitewing done in 2025, which does not count against 2026 | none (routine) | E04, R-010 |
| SYN-1009-02 | A | Sealant in 2024-06; next one allowed 2027-06-03 (1 per 36 months) | R09 | E14 |
| SYN-1010-01 | B | Terminated 2026-10-31 | R05 | E19 |
| SYN-1011-01 | A | Future-effective: coverage starts 2027-01-01 | R05 | E20 |
| SYN-1012-01 | A | Terminates 2026-12-15 | A01 within 30 days; R05 after the date; boundary days tested | E21, E22, E37, E40 |
| SYN-1013-01 | B | Annual maximum nearly used ($150 left) | A02 | E38 |
| SYN-1014-01 | A | Two cleanings and a bitewing used in 2026; crown in 2023-05 (1 per 60 months) | R09 | E11, E12, E13 |
| SYN-1015-01 | A | Parent of the two age-limit children | none (no case needed) | none |
| SYN-1015-02 | A | Turns 19 on 2026-11-20 (fluoride age limit) | none on 2026-11-19; R10 on 2026-11-20 | E10, E27 |
| SYN-1015-03 | A | Turned 16 on 2026-11-25 (sealant age limit) | R10 | E28 |
| SYN-1016-01 | B | Effective 2026-08-01, inside the 6-month basic wait | R08 (filling) | E16 |
| SYN-1016-02 | B | Child, effective 2026-08-01, inside the 12-month orthodontic wait | R08 (orthodontics) | E17 |
| SYN-1017-01 | A | Effective 2025-12-01; the major wait ends exactly on 2026-12-01 | none on the boundary day; A03 for the covered crown | E18 |

## Rules that do not depend on a member

| Rule | Trigger | Used in |
|---|---|---|
| R01 PROVIDER_UNKNOWN | provider_id `PRV-04` is suspended (an unregistered ID gets the same answer) | E35 |
| R02 BATCH_TOO_LARGE | 26 rows in one call | E36, test/server.test.ts |
| R07 UNKNOWN_PROCEDURE | IDs not in the catalog: `PERIO-SCALING`, `TMJ-SPLINT`, `XRAY-PANO` | E32, E33, E34 |

## Coverage check

Every rule fires in at least one engine case: R01 E35, R02 E36, R03 E23-E24, R04 E25, R05 E19-E20 and E22, R06 E31-E32, R07 E32-E34, R08 E15-E17, R09 E11-E14, R10 E27-E28, R11 E29-E30, A01 E21 and E37, A02 E38, A03 E18 and E39. `test/data.test.ts` checks that this file names every member and every rule ID.
