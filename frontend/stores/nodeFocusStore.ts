import { create } from 'zustand';

// Notes/Tasarim-Kurallari.md § Durum yönetimi — ayrı store. OrbitNodes.tsx (3D, tıklama)
// ve NodeFocusCard.tsx (2D, sağ panel) aynı "seçili düğüm" durumunu paylaşıyor —
// tek seferde en fazla bir düğüm aktif olabilsin diye (kullanıcı isteği, 2026-07-27).
interface NodeFocusState {
  focusedNodeId: string | null;
  setFocusedNode: (id: string | null) => void;
  toggleFocusedNode: (id: string) => void;
}

export const useNodeFocusStore = create<NodeFocusState>((set) => ({
  focusedNodeId: null,
  setFocusedNode: (id) => set({ focusedNodeId: id }),
  toggleFocusedNode: (id) =>
    set((state) => ({ focusedNodeId: state.focusedNodeId === id ? null : id })),
}));
