'use client';

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

// Mouse Interaction: Depth, Parallax.
// CLAUDE.md § MOTION — "Panels react slightly." Çok küçük bir kayma
// (birkaç piksel, "never exaggerated") — React state kullanmıyor (mousemove
// başına re-render olmasın diye), doğrudan DOM transform'unu güncelliyor.
// Performans: prefers-reduced-motion'da sürekli rAF döngüsü hiç
// başlamıyor.
export function useMouseParallax<T extends HTMLElement>(strength = 6) {
  const ref = useRef<T>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const element = ref.current;
    if (!element || reducedMotion) return;

    let frameId: number;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const handleMove = (event: MouseEvent) => {
      const nx = (event.clientX / window.innerWidth) * 2 - 1;
      const ny = (event.clientY / window.innerHeight) * 2 - 1;
      targetX = nx * strength;
      targetY = ny * strength;
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      element.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`;
      frameId = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', handleMove);
    frameId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      cancelAnimationFrame(frameId);
    };
  }, [strength, reducedMotion]);

  return ref;
}
