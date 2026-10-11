import type { ConceptId } from './api';

/**
 * Presentation for each gremlin: the character name and a one-line marketing tagline.
 * The chess truth (name, definition, habit) comes from the engine's ConceptInfo; names here
 * must match apps/engine/src/analysis/concepts.ts CONCEPTS[id].gremlin.
 */
export const GREMLINS: Record<ConceptId, { name: string; tagline: string }> = {
  hanging_piece: { name: 'The Hanger', tagline: 'Walks off with the piece you left loose.' },
  double_attack: { name: 'Double Trouble', tagline: 'One move, two threats, and you can only stop one.' },
  missed_mate_threat: { name: 'The Mate Misser', tagline: 'Looks everywhere except at the mate coming for you.' },
  weak_back_rank: { name: 'The Back-Rank Sleeper', tagline: 'Naps while a rook slides onto your back rank.' },
  losing_exchange: { name: 'The Bad Trader', tagline: 'Offers a trade that is never as fair as it looks.' },
  missed_chance: { name: 'The Daydreamer', tagline: 'Gazes at the clouds while their piece sits there for the taking.' },
};

export const GREMLIN_ORDER: ConceptId[] = [
  'hanging_piece',
  'double_attack',
  'missed_chance',
  'missed_mate_threat',
  'weak_back_rank',
  'losing_exchange',
];
