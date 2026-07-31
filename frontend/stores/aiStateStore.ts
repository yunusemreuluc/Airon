import { create } from 'zustand';

// CLAUDE.md § ENERGY CORE — tüm 3D sahne (EnergyCore,
// ElectricArcs, OrbitNodes, NodeConnections) ve 2D HUD bu tek durumu okuyor.
// ileride backend'in `energy_state` WebSocket olayı bu store'u besleyecek —
// şimdilik frontend/hooks/useDemoAIStateCycle.ts geçici bir demo döngüsüyle besliyor.
export type AIState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'vision';

// BrandBadge.tsx (canlı durum metni) ve NodeFocusCard.tsx (odak kartı alt başlığı)
// aynı etiketleri paylaşıyor — tek yerde tutuluyor.
export const AI_STATE_LABELS: Record<AIState, string> = {
  idle: 'Boşta',
  listening: 'Dinliyor',
  thinking: 'Düşünüyor',
  speaking: 'Konuşuyor',
  vision: 'Görüyor',
};

interface AIStateStore {
  aiState: AIState;
  setAIState: (state: AIState) => void;
}

export const useAIStateStore = create<AIStateStore>((set) => ({
  aiState: 'idle',
  setAIState: (aiState) => set({ aiState }),
}));

// "AI düşünürken: Orbit yavaşlasın."
export function getOrbitSpeedMultiplier(state: AIState): number {
  if (state === 'thinking') return 0.4;
  if (state === 'speaking') return 1.25;
  return 1;
}
