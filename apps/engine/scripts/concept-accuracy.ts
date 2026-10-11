/**
 * Offline concept-tag gate. Reads benchmark/concepts/labelled.json.
 * Exit 1 when overall accuracy or non-null precision is under 0.90.
 *
 *   pnpm --filter @chessplain/engine benchmark:concepts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONCEPT_IDS, classifyMoment, type ConceptId } from '../src/analysis/concepts.js';
import type { CandidateMoment } from '../src/types.js';

type Label = ConceptId | null;

interface LabelledMoment {
  id: string;
  source_game_url: string;
  candidate: CandidateMoment;
  label: Label;
  why: string;
  note?: string;
}

const file = join(dirname(fileURLToPath(import.meta.url)), '../benchmark/concepts/labelled.json');
const rows = JSON.parse(readFileSync(file, 'utf8')) as LabelledMoment[];

const counts = new Map<Label, number>();
for (const row of rows) counts.set(row.label, (counts.get(row.label) ?? 0) + 1);

let correct = 0;
let predicted = 0;
let predictedCorrect = 0;
const per = new Map<ConceptId, { tp: number; fp: number; fn: number }>();
for (const id of CONCEPT_IDS) per.set(id, { tp: 0, fp: 0, fn: 0 });

const disagreements: string[] = [];

for (const row of rows) {
  const predictedLabel = classifyMoment(row.candidate);
  if (predictedLabel === row.label) correct += 1;
  else {
    disagreements.push(
      [
        row.id,
        `label=${row.label ?? 'null'}`,
        `pred=${predictedLabel ?? 'null'}`,
        row.candidate.san,
        row.candidate.fenBefore,
        `line=${row.candidate.refutationLineSan || '(empty)'}`,
        row.why,
      ].join('\n  '),
    );
  }
  if (predictedLabel !== null) {
    predicted += 1;
    if (predictedLabel === row.label) predictedCorrect += 1;
  }
  if (row.label && predictedLabel === row.label) per.get(row.label)!.tp += 1;
  if (predictedLabel && predictedLabel !== row.label) per.get(predictedLabel)!.fp += 1;
  if (row.label && predictedLabel !== row.label) per.get(row.label)!.fn += 1;
}

const accuracy = rows.length === 0 ? 0 : correct / rows.length;
const precision = predicted === 0 ? 0 : predictedCorrect / predicted;

console.log(`moments ${rows.length}`);
console.log('class balance');
for (const id of [null, ...CONCEPT_IDS] as Label[]) {
  console.log(`  ${id ?? 'null'} ${counts.get(id) ?? 0}`);
}
console.log(`overall accuracy ${accuracy.toFixed(3)} (${correct}/${rows.length})`);
console.log(`non-null precision ${precision.toFixed(3)} (${predictedCorrect}/${predicted})`);
for (const id of CONCEPT_IDS) {
  const { tp, fp, fn } = per.get(id)!;
  const p = tp + fp === 0 ? null : tp / (tp + fp);
  const r = tp + fn === 0 ? null : tp / (tp + fn);
  const fmt = (value: number | null, num: number, den: number) =>
    value === null ? `n/a (0/${den})` : `${value.toFixed(3)} (${num}/${den})`;
  console.log(`  ${id} precision ${fmt(p, tp, tp + fp)} recall ${fmt(r, tp, tp + fn)}`);
}
console.log(`disagreements ${disagreements.length}`);
for (const line of disagreements) console.log(`- ${line}`);

if (accuracy < 0.9 || precision < 0.9) process.exit(1);
