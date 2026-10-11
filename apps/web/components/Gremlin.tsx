import type { ConceptId } from '../lib/api';
import { GREMLINS } from '../lib/gremlins';

/**
 * The one place a gremlin character is drawn. Today it is a still illustration;
 * when the Rive animations arrive, swap the <img> for the Rive canvas here and every
 * screen follows. Decorative by default: pass `label` when the character carries meaning.
 */
export function Gremlin({ concept, size = 240, label, className, priority }: {
  concept: ConceptId;
  size?: number;
  label?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <img
      src={`/gremlins/${concept}.png`}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      width={size}
      height={size}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      className={className}
      style={{ width: size, height: 'auto', maxWidth: '100%' }}
      title={label ?? GREMLINS[concept].name}
    />
  );
}
