'use client';

import { useEffect, useRef, type ElementType, type ReactNode, type CSSProperties } from 'react';

/**
 * Scroll reveal. Children are visible without JS; after hydration the element is marked
 * pending and revealed once when it enters the viewport. Pass `index` to stagger siblings
 * (60ms apart, see globals.css). Reduced motion users get no movement (CSS-gated).
 */
export function Reveal({ as: Tag = 'div', index = 0, className, style, children }: {
  as?: ElementType;
  index?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return; // already on screen: never hide it
    el.dataset.reveal = 'pending';
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { el.dataset.reveal = 'in'; io.disconnect(); }
    }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={className} style={{ ...style, '--i': index } as CSSProperties}>{children}</Tag>;
}
