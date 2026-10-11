import type { ConceptId } from '../lib/api';

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
  const base = `/gremlins/${concept}`;
  return (
    <img
      src={`${base}-320.webp`}
      srcSet={`${base}-160.webp 160w, ${base}-320.webp 320w, ${base}-640.webp 640w`}
      sizes={`${size}px`}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      width={size}
      height={size}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      draggable={false}
      className={className}
      title={label}
    />
  );
}
