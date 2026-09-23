import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import {
  MOMENT_SYSTEM_PROMPT,
  PROMPT_VERSION,
  buildMomentPayload,
  cleanJsonString,
  validateMomentJson,
} from '../src/analysis/prompts.js';
import type { MomentExplanation } from '../src/types.js';
import type { BenchmarkFixture } from './export-benchmark-fixtures.js';

/**
 * Moment-explanation benchmark across models, through OpenRouter's normal
 * routing (any host). The report records which provider served each call, so
 * a host that underperforms shows up and can be excluded by provider slug.
 *
 *   OPENROUTER_API_KEY=… pnpm --filter @chessplain/engine benchmark:models \
 *     [-- --models gpt-6-luna,qwen3.8-flash] [--limit 10] [--runs 2] [--judge anthropic/claude-sonnet-5 | --no-judge]
 *
 * Inputs are benchmark/fixtures.json (see export-benchmark-fixtures.ts), sent
 * through the production payload builder and system prompt. Output lands in
 * benchmark/results/ as markdown for reading and JSON for comparison.
 */

interface Candidate {
  label: string;
  model: string;
  reasoning: 'none' | 'low';
}

const CANDIDATES: Candidate[] = [
  { label: 'gpt-6-luna', model: 'openai/gpt-6-luna', reasoning: 'none' },
  { label: 'gpt-6-luna+low', model: 'openai/gpt-6-luna', reasoning: 'low' },
  { label: 'gpt-6-luna-pro', model: 'openai/gpt-6-luna-pro', reasoning: 'none' },
  { label: 'deepseek-v4.1-flash', model: 'deepseek/deepseek-v4.1-flash', reasoning: 'none' },
  { label: 'qwen3.8-flash', model: 'qwen/qwen3.8-flash', reasoning: 'none' },
  { label: 'qwen3.8-omni-flash', model: 'qwen/qwen3.8-omni-flash', reasoning: 'none' },
];

/**
 * Hand-checked expectations for positions whose explanation failed in
 * production. Keyed by position + move so they survive fixture regeneration.
 */
const CURATED: Record<string, { mustMention: RegExp[]; mustNotMention: RegExp[]; note: string }> = {
  '2rq1rk1/p4ppp/2p1p3/2nn4/8/3P1BP1/P1Q3PP/BR3RK1 b - - 2 18|18...Ne3': {
    note: 'After Qxc5 Nxf1 Qc3 the f1 knight cannot escape: Qxg7 is mate (queen + a1 bishop).',
    mustMention: [/mate/i, /g7/],
    mustNotMention: [/knight on e3 is (under attack|attacked)/i],
  },
};

const API = 'https://openrouter.ai/api/v1/chat/completions';
const KEY = process.env.OPENROUTER_API_KEY;
const JUDGE_SYSTEM = `You grade chess explanations written for adult club players.
You receive the verified FACTS (engine and board facts: every move of the
refutation line with its pieces and squares, mate threats, and why the obvious
defence fails) and the EXPLANATION a model wrote from them.

Score each criterion 1-5 (5 best) and list concrete problems:
- accuracy: every claim matches the facts — right piece on the right square at the right moment, no invented moves.
- explains_why: says WHY the refutation works — the point of each quiet move, and why the obvious defence fails when the facts give that reason. 1 = restates moves without reasons.
- plausible_thought: probable_thought is a reasonable idea a player at this rating could hold in this position.
- useful_takeaway: one habit a player can actually check mid-game, tied to this mistake.
- errors: each factual error or missing key reason, one short sentence each (empty if none).`;

const score = { type: 'integer', minimum: 1, maximum: 5 };
const JUDGE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'judgement',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['accuracy', 'explains_why', 'plausible_thought', 'useful_takeaway', 'errors'],
      properties: {
        accuracy: score,
        explains_why: score,
        plausible_thought: score,
        useful_takeaway: score,
        errors: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function openRouter(body: Record<string, unknown>) {
  const started = Date.now();
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, usage: { include: true } }),
    signal: AbortSignal.timeout(90_000),
  });
  const json = (await res.json()) as {
    provider?: string;
    error?: { message?: string };
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; completion_tokens_details?: { reasoning_tokens?: number } };
  };
  if (!res.ok || json.error) throw new Error(`${res.status} ${json.error?.message ?? 'request failed'}`);
  return { json, ms: Date.now() - started };
}

/** Squares where a piece of each type stands at some point in the line — what the text may name. */
function knownPieceSquares(f: BenchmarkFixture): Set<string> {
  const known = new Set<string>();
  const record = (chess: Chess) => {
    for (const row of chess.board()) for (const cell of row) if (cell) known.add(`${cell.type}${cell.square}`);
  };
  const walk = (moves: string[]) => {
    const chess = new Chess(f.candidate.fenBefore);
    record(chess);
    for (const san of moves) {
      try {
        chess.move(san.replace(/^\d+\.+/, ''));
      } catch {
        return;
      }
      record(chess);
    }
  };
  walk([f.candidate.san, ...f.candidate.refutationLineSan.split(/\s+/).filter(Boolean)]);
  walk([f.candidate.bestMoveSan]);
  return known;
}

const PIECE_LETTER: Record<string, string> = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' };

/** "knight on e3"-style claims naming a piece that never stands on that square in any line position. */
function phantomPieces(text: string, known: Set<string>): string[] {
  const phantoms: string[] = [];
  for (const m of text.matchAll(/\b(king|queen|rook|bishop|knight|pawn)s? (?:on|at|from) ([a-h][1-8])\b/gi)) {
    if (!known.has(`${PIECE_LETTER[m[1].toLowerCase()]}${m[2]}`)) phantoms.push(m[0]);
  }
  return phantoms;
}

interface Result {
  fixture: string;
  candidate: string;
  run: number;
  servedBy?: string;
  ms?: number;
  costUsd?: number;
  reasoningTokens?: number;
  valid: boolean;
  errors: string[];
  phantoms: string[];
  curated?: { passed: boolean; failures: string[] };
  output?: MomentExplanation;
  judge?: { accuracy: number; explains_why: number; plausible_thought: number; useful_takeaway: number; errors: string[] };
}

async function runOne(f: BenchmarkFixture, c: Candidate, run: number, judgeModel: string | null): Promise<Result> {
  const payload = buildMomentPayload(f.candidate, f.eloBand, 'Sam');
  const result: Result = { fixture: f.id, candidate: c.label, run, valid: false, errors: [], phantoms: [] };
  try {
    const { json, ms } = await openRouter({
      model: c.model,
      messages: [
        { role: 'system', content: MOMENT_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      // Production budget for 'none'; reasoning variants need room to think first.
      max_tokens: c.reasoning === 'none' ? 500 : 3000,
      reasoning: { effort: c.reasoning },
    });
    Object.assign(result, {
      servedBy: json.provider,
      ms,
      costUsd: json.usage?.cost,
      reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens,
    });
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(cleanJsonString(json.choices?.[0]?.message?.content ?? ''));
    } catch {}
    const validation = validateMomentJson(parsed);
    result.valid = validation.isValid;
    result.errors = validation.errors;
    if (!validation.parsed) return result;
    result.output = validation.parsed;
  } catch (err) {
    result.errors = [err instanceof Error ? err.message : String(err)];
    return result;
  }

  const text = [result.output.probable_thought, result.output.what_actually_happens, result.output.takeaway].join('\n');
  result.phantoms = phantomPieces(text, knownPieceSquares(f));
  const curated = CURATED[`${f.candidate.fenBefore}|${f.candidate.san}`];
  if (curated) {
    const failures = [
      ...curated.mustMention.filter((re) => !re.test(text)).map((re) => `missing ${re}`),
      ...curated.mustNotMention.filter((re) => re.test(text)).map((re) => `contains ${re}`),
    ];
    result.curated = { passed: failures.length === 0, failures };
  }

  if (judgeModel) {
    let lastError = '';
    for (let attempt = 0; attempt < 2 && !result.judge; attempt++) {
      try {
        const { json } = await openRouter({
          model: judgeModel,
          messages: [
            { role: 'system', content: JUDGE_SYSTEM },
            { role: 'user', content: JSON.stringify({ FACTS: payload, EXPLANATION: result.output }) },
          ],
          response_format: JUDGE_SCHEMA,
          temperature: 0,
          // Default reasoning spends the whole budget thinking and returns nothing;
          // low effort answers directly (~$0.0045/judgement vs ~$0.03).
          max_tokens: 4000,
          reasoning: { effort: 'low' },
        });
        const parsed = JSON.parse(cleanJsonString(json.choices?.[0]?.message?.content ?? '{}'));
        if (['accuracy', 'explains_why', 'plausible_thought', 'useful_takeaway'].every((k) => typeof parsed[k] === 'number')) {
          result.judge = { ...parsed, errors: Array.isArray(parsed.errors) ? parsed.errors : [] };
        } else {
          lastError = `malformed: ${JSON.stringify(parsed).slice(0, 120)}`;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    if (!result.judge) result.errors.push(`judge: ${lastError}`);
  }
  return result;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? NaN;
const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '–');

function report(results: Result[], candidates: Candidate[], fixtures: BenchmarkFixture[], judgeModel: string | null): string {
  const lines = [
    `# Moment explanation benchmark — ${new Date().toISOString()}`,
    '',
    `Prompt \`${PROMPT_VERSION}\` · ${fixtures.length} positions · judge: ${judgeModel ?? 'none'}`,
    '',
    '| Model | Served by | Valid | Phantom pieces | Curated | Accuracy | Explains why | Thought | Takeaway | p50 s | p95 s | $/1k moments |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const c of candidates) {
    const rs = results.filter((r) => r.candidate === c.label);
    const judged = rs.filter((r) => r.judge && typeof r.judge.accuracy === 'number');
    const curated = rs.filter((r) => r.curated);
    const ms = rs.flatMap((r) => (r.ms ? [r.ms / 1000] : []));
    const cost = rs.flatMap((r) => (r.costUsd !== undefined ? [r.costUsd] : []));
    lines.push(
      `| ${c.label} | ${[...new Set(rs.map((r) => r.servedBy).filter(Boolean))].join(', ') || '–'} | ${rs.filter((r) => r.valid).length}/${rs.length} | ${rs.filter((r) => r.phantoms.length).length} | ${curated.length ? `${curated.filter((r) => r.curated!.passed).length}/${curated.length}` : '–'} | ${fmt(mean(judged.map((r) => r.judge!.accuracy)))} | ${fmt(mean(judged.map((r) => r.judge!.explains_why)))} | ${fmt(mean(judged.map((r) => r.judge!.plausible_thought)))} | ${fmt(mean(judged.map((r) => r.judge!.useful_takeaway)))} | ${fmt(pct(ms, 0.5), 1)} | ${fmt(pct(ms, 0.95), 1)} | ${fmt(mean(cost) * 1000)} |`
    );
  }
  lines.push('', 'Phantom pieces = "knight on e3"-style claims naming a piece never on that square in the line. Judge scores are 1–5.', '');

  for (const f of fixtures) {
    const curated = CURATED[`${f.candidate.fenBefore}|${f.candidate.san}`];
    lines.push(
      `## ${f.id} — ${f.candidate.san} (${f.candidate.candidateType})`,
      '',
      `FEN \`${f.candidate.fenBefore}\` · best ${f.candidate.bestMoveSan} · line ${f.candidate.refutationLineSan || '–'}${curated ? `  \nExpected: ${curated.note}` : ''}`,
      ''
    );
    for (const r of results.filter((x) => x.fixture === f.id)) {
      const flags = [...r.errors, ...r.phantoms.map((p) => `phantom: ${p}`), ...(r.curated?.failures ?? []).map((x) => `curated: ${x}`), ...(r.judge?.errors ?? []).map((e) => `judge: ${e}`)];
      const scores = r.judge ? ` · acc ${r.judge.accuracy} / why ${r.judge.explains_why} / thought ${r.judge.plausible_thought} / takeaway ${r.judge.useful_takeaway}` : '';
      lines.push(`**${r.candidate}**${r.run > 1 ? ` run ${r.run}` : ''}${scores}`, '');
      if (r.output) {
        lines.push(`> *${r.output.probable_thought}*`, '>', `> ${r.output.what_actually_happens}`, '>', `> **${r.output.concept_name}** — ${r.output.takeaway}`, '');
      }
      if (flags.length) lines.push(...flags.map((x) => `- ${x}`), '');
    }
  }
  return lines.join('\n');
}

async function main() {
  if (!KEY) throw new Error('OPENROUTER_API_KEY is required.');
  const filter = arg('models')?.split(',');
  const candidates = filter ? CANDIDATES.filter((c) => filter.includes(c.label)) : CANDIDATES;
  if (filter && candidates.length !== filter.length) {
    throw new Error(`Unknown --models label; known: ${CANDIDATES.map((c) => c.label).join(', ')}`);
  }
  const all: BenchmarkFixture[] = JSON.parse(readFileSync(new URL('../benchmark/fixtures.json', import.meta.url), 'utf8'));
  const fixtures = all.slice(0, Number(arg('limit') ?? all.length));
  const runs = Number(arg('runs') ?? 1);
  const judgeModel = process.argv.includes('--no-judge') ? null : (arg('judge') ?? 'anthropic/claude-sonnet-5');

  const tasks = fixtures.flatMap((f) => candidates.flatMap((c) => Array.from({ length: runs }, (_, i) => () => runOne(f, c, i + 1, judgeModel))));
  console.log(`${tasks.length} generations (${fixtures.length} positions × ${candidates.length} models × ${runs} runs)`);
  // ponytail: fixed 8-way concurrency; add per-provider limits if one provider rate-limits.
  const results: Result[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < tasks.length) {
        const r = await tasks[next++]();
        results.push(r);
        process.stdout.write(r.valid ? '.' : 'x');
      }
    })
  );
  console.log();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = new URL('../benchmark/results/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL(`${stamp}.json`, dir), JSON.stringify({ promptVersion: PROMPT_VERSION, judgeModel, candidates, results }, null, 1));
  const md = report(results, candidates, fixtures, judgeModel);
  writeFileSync(new URL(`${stamp}.md`, dir), md);
  console.log(md.split('\n## ')[0]);
  console.log(`Full report: benchmark/results/${stamp}.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
