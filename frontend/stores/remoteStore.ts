import { create } from 'zustand';

// Telefon arayüzünün (app/m) kendine ait durumu. Sohbet satırları ve asistan
// bayrakları masaüstüyle ortak `conversationStore`'da; burada yalnızca telefona
// özgü olanlar: oturum kapısı ve o an çalışan araç.
export type GateState = 'checking' | 'locked' | 'open';

export interface ActiveTask {
  name: string;
  startedAt: number;
}

interface RemoteStore {
  gate: GateState;
  /** Backend asistanı çalıştırıyor mu (desktop.py --sadece-arayuz değil)? */
  assistantRunning: boolean | null;
  activeTask: ActiveTask | null;
  setGate: (gate: GateState) => void;
  setAssistantRunning: (running: boolean) => void;
  taskStarted: (name: string, at?: number) => void;
  taskFinished: (name: string) => void;
}

export const useRemoteStore = create<RemoteStore>((set) => ({
  gate: 'checking',
  assistantRunning: null,
  activeTask: null,
  setGate: (gate) => set({ gate }),
  setAssistantRunning: (assistantRunning) => set({ assistantRunning }),
  taskStarted: (name, at) => set({ activeTask: { name, startedAt: at ?? Date.now() / 1000 } }),
  // Yalnızca AYNI aracın bitişi göstergeyi kapatıyor: art arda iki araç
  // çağrısında birincinin bitişi ikincinin göstergesini silmesin.
  taskFinished: (name) =>
    set((state) => (state.activeTask?.name === name ? { activeTask: null } : state)),
}));
