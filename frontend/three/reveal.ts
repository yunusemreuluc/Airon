import * as THREE from 'three';

// Açılış Animasyonu. Sahnedeki nesneler, Canvas'ın
// kendi saatine (mount anından itibaren geçen süre) göre kademeli gecikmelerle
// "büyüyerek/belirerek" ortaya çıkıyor — BootOverlay.tsx'teki Logo/Fade-In
// aşamasıyla aynı zaman çizelgesini (üstü kapalı, sabit gecikmelerle) paylaşıyor.
export function getRevealProgress(elapsedTime: number, delay: number, duration: number): number {
  const raw = (elapsedTime - delay) / duration;
  const clamped = THREE.MathUtils.clamp(raw, 0, 1);
  return 1 - (1 - clamped) ** 3; // easeOutCubic
}
