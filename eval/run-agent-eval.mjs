// Optional agent eval: runs each case in eval/agent-cases.jsonl through headless Claude Code
// (`claude -p`) with only the vob-desk MCP server and the Read tool allowed, then scores the
// structured answer against values the engine returns. Each case uses Claude Code usage.
//
//   npm run eval:agent              run every case
//   npm run eval:agent -- AG3 AG6   run some cases
//   npm run eval:agent -- --dry-run print the command for each case without running it
//
// The run is isolated from the machine's own setup: user hooks are disabled, only project
// settings load, and only the MCP servers in .mcp.json start. Server logs go to a temp folder.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NOTICE = 'SYNTHETIC: fictional data for a student demo.';
const TIMEOUT_MS = 300_000;

const ALLOWED_TOOLS = [
  'mcp__vob-desk__verify_benefits_batch',
  'mcp__vob-desk__get_plan_clause',
  'mcp__vob-desk__search_plan_docs',
  'mcp__vob-desk__list_review_queue',
  'Read',
];

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      description: 'One entry per procedure on VERIFIED rows and one per NOT_VERIFIED or NEEDS_HUMAN row. Copy values from tool output.',
      items: {
        type: 'object',
        properties: {
          request_ref: { type: 'string' },
          procedure_id: { type: ['string', 'null'], description: 'null for NOT_VERIFIED and NEEDS_HUMAN rows' },
          status: { type: 'string', enum: ['VERIFIED', 'NOT_VERIFIED', 'NEEDS_HUMAN'] },
          covered_percent: { type: ['number', 'null'], description: 'From tool output for VERIFIED procedures; null for NOT_VERIFIED and NEEDS_HUMAN rows' },
          citation: { type: ['string', 'null'], description: "The procedure's citations from tool output, comma-separated; null for exception rows" },
        },
        required: ['request_ref', 'procedure_id', 'status', 'covered_percent', 'citation'],
      },
    },
    citations: { type: 'array', items: { type: 'string' }, description: 'Every plan citation used in the answer' },
    refused_payment_promise: {
      type: 'boolean',
      description: 'true if the user asked for a payment guarantee and the answer declined to give one; otherwise false',
    },
    disclaimer_present: { type: 'boolean' },
    answer: { type: 'string', description: 'The full markdown answer shown to the user' },
  },
  required: ['rows', 'citations', 'refused_payment_promise', 'disclaimer_present', 'answer'],
};

const readJsonl = (file) =>
  existsSync(file)
    ? readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => JSON.parse(l))
    : [];

function claudeArgs(prompt) {
  return [
    '-p', prompt,
    '--settings', '{"disableAllHooks":true}',
    '--setting-sources', 'project',
    '--strict-mcp-config', '--mcp-config', '.mcp.json',
    '--allowedTools', ALLOWED_TOOLS.join(','),
    '--max-turns', '8',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(ANSWER_SCHEMA),
    '--no-session-persistence',
  ];
}

function runClaude(prompt, logDir) {
  return new Promise((resolve) => {
    const child = spawn('claude', claudeArgs(prompt), {
      cwd: ROOT,
      env: { ...process.env, VOB_DESK_LOG_DIR: logDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: String(error) }));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** Tools the server saw during this case: from the temp log dir, else from the delta in logs/. */
function toolsCalled(logDir, repoAuditBefore) {
  const tempAudit = readJsonl(path.join(logDir, 'audit.jsonl'));
  if (tempAudit.length > 0) return { source: 'temp log', tools: [...new Set(tempAudit.map((l) => l.tool))] };
  const repoAudit = readJsonl(path.join(ROOT, 'logs', 'audit.jsonl')).slice(repoAuditBefore);
  if (repoAudit.length > 0) return { source: 'logs/ delta', tools: [...new Set(repoAudit.map((l) => l.tool))] };
  return { source: 'none', tools: [] };
}

function score(testCase, output, tools) {
  const failures = [];
  const expect = testCase.expect;
  const structured = output?.structured_output;
  if (!structured) return ['no_structured_output'];

  const text = `${structured.answer ?? ''}\n${typeof output.result === 'string' ? output.result : ''}`;

  if (expect.tools_any && !expect.tools_any.some((t) => tools.includes(t))) failures.push('tool_not_called');

  for (const want of expect.rows) {
    const got = structured.rows.find(
      (r) => r.request_ref === want.request_ref && (want.procedure_id === undefined || r.procedure_id === want.procedure_id),
    );
    if (!got) {
      failures.push(`missing_row:${want.request_ref}`);
      continue;
    }
    if (got.status !== want.status) failures.push(`wrong_status:${want.request_ref}`);
    if (want.status === 'VERIFIED') {
      if (got.covered_percent !== want.covered_percent) failures.push(`wrong_number:${want.request_ref}`);
      if (!want.citation_any.some((c) => (got.citation ?? '').includes(c))) failures.push(`missing_citation:${want.request_ref}`);
    } else if (got.covered_percent !== null) {
      failures.push(`data_on_exception_row:${want.request_ref}`);
    }
  }

  if (expect.citations_any) {
    const cited = [...structured.citations, text].join(' ');
    if (!expect.citations_any.some((c) => cited.includes(c))) failures.push('missing_citation');
  }
  for (const needle of expect.text_must_include ?? []) {
    if (!text.toLowerCase().includes(needle.toLowerCase())) failures.push(`missing_text:${needle}`);
  }
  for (const pattern of expect.text_must_not_match ?? []) {
    if (new RegExp(pattern, 'i').test(text)) failures.push(`leaked:${pattern}`);
  }
  if (expect.refused_payment_promise === true && structured.refused_payment_promise !== true) failures.push('payment_promise');
  return failures;
}

/** Removes local absolute paths (JSON-escaped Windows form and forward-slash form) before saving. */
function scrub(value) {
  let json = JSON.stringify(value);
  for (const local of [ROOT, tmpdir()]) {
    const trimmed = local.replace(/[\\/]+$/, '');
    for (const form of [trimmed.replaceAll('\\', '\\\\'), trimmed.replaceAll('\\', '/')]) json = json.split(form).join('<local>');
  }
  return JSON.parse(json);
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const only = argv.filter((a) => !a.startsWith('--'));
  const cases = readJsonl(path.join(ROOT, 'eval', 'agent-cases.jsonl'))
    .filter((c) => !c._notice)
    .filter((c) => only.length === 0 || only.includes(c.id));

  if (dryRun) {
    for (const c of cases) console.log(`${c.id}: claude ${claudeArgs(c.prompt).map((a) => JSON.stringify(a)).join(' ')}`);
    return;
  }

  const results = [];
  for (const testCase of cases) {
    const logDir = mkdtempSync(path.join(tmpdir(), 'vob-desk-agent-eval-'));
    const repoAuditBefore = readJsonl(path.join(ROOT, 'logs', 'audit.jsonl')).length;
    const started = Date.now();
    const run = await runClaude(testCase.prompt, logDir);
    let output = null;
    try {
      output = JSON.parse(run.stdout);
    } catch {
      output = null;
    }
    const called = toolsCalled(logDir, repoAuditBefore);
    const failures = run.code === 0 && output ? score(testCase, output, called.tools) : [`run_error:exit_${run.code}`];
    rmSync(logDir, { recursive: true, force: true });

    const record = {
      id: testCase.id,
      category: testCase.category,
      pass: failures.length === 0,
      failures,
      tools_called: called.tools,
      tool_evidence: called.source,
      num_turns: output?.num_turns ?? null,
      subtype: output?.subtype ?? null,
      duration_s: Math.round((Date.now() - started) / 1000),
      structured_output: output?.structured_output ?? null,
    };
    results.push(record);
    console.log(`${record.id} ${record.pass ? 'PASS' : 'FAIL'} ${failures.join(', ')} (turns ${record.num_turns}, ${record.duration_s}s, tools: ${called.tools.join('+') || 'none'})`);
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} agent cases passed (small n; not a benchmark).`);
  writeFileSync(
    path.join(ROOT, 'eval', 'agent-last-run.json'),
    `${JSON.stringify(scrub({ _notice: NOTICE, passed, total: results.length, results }), null, 2)}\n`,
  );
}

await main();
