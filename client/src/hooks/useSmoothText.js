import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Reveals streamed text character by character.
 *
 * Network chunks arrive in uneven bursts; this hook releases them at a steady
 * typing pace, speeding up when it falls behind so it never lags far behind
 * the real stream.
 */
export function useSmoothText(target, { animate, streaming }) {
  const enabled = animate && !prefersReducedMotion();
  const [count, setCount] = useState(enabled ? 0 : target.length);
  const positionRef = useRef(enabled ? 0 : target.length);
  const targetRef = useRef(target);
  const streamingRef = useRef(streaming);

  useLayoutEffect(() => {
    targetRef.current = target;
    streamingRef.current = streaming;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    let frame;
    let last = performance.now();

    const tick = (now) => {
      const total = targetRef.current.length;
      const backlog = total - positionRef.current;

      if (backlog > 0) {
        const elapsed = Math.min(now - last, 100);
        const charsPerSecond = Math.max(70, backlog * 4);
        positionRef.current = Math.min(total, positionRef.current + (charsPerSecond * elapsed) / 1000);
        setCount(Math.floor(positionRef.current));
      }
      last = now;

      if (backlog > 0 || streamingRef.current) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, streaming]);

  if (!enabled) return { text: target, caughtUp: true };
  const text = target.slice(0, count);
  return { text, caughtUp: count >= target.length };
}
