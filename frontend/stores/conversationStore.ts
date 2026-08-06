import { create } from 'zustand';

// Sesli asistanın (main.py → AironLive) sohbet akışı. Satırlar backend'den
// "log" olayı olarak geliyor (bkz. core/web_ui.py write_log).
export type LogKind = 'user' | 'airon' | 'system' | 'error';

export interface LogLine {
  id: number;
  kind: LogKind;
  text: string;
  at: number;
}

// AironUI'nin (ui.py) yıllardır kullandığı önek sözleşmesi — kaynak metni
// değiştirmeden burada tipe çevriliyor.
const PREFIXES: { prefix: string; kind: LogKind }[] = [
  { prefix: 'siz:', kind: 'user' },
  { prefix: 'you:', kind: 'user' },
  { prefix: 'aıron:', kind: 'airon' },
  { prefix: 'airon:', kind: 'airon' },
  { prefix: 'sys:', kind: 'system' },
  { prefix: 'err:', kind: 'error' },
];

function parseLogLine(raw: string): { kind: LogKind; text: string } {
  const lowered = raw.toLowerCase();
  for (const { prefix, kind } of PREFIXES) {
    if (lowered.startsWith(prefix)) {
      return { kind, text: raw.slice(prefix.length).trim() };
    }
  }
  return { kind: 'system', text: raw };
}

// Uzun oturumlarda bellek sınırsız büyümesin — panelde görünenden fazlası
// zaten okunmuyor.
const MAX_LINES = 200;

interface ConversationStore {
  lines: LogLine[];
  connected: boolean;
  /** Gemini Live oturumu kuruldu mu? Kurulmadan gönderilen komut kaybolur —
   *  bu yüzden yazma kutusu bu bayrağa bakıyor (bkz. backend/api/voice.py). */
  ready: boolean;
  muted: boolean;
  paused: boolean;
  appendLog: (raw: string, at?: number) => void;
  setConnected: (connected: boolean) => void;
  setStatus: (status: { muted?: boolean; paused?: boolean; ready?: boolean }) => void;
  clear: () => void;
}

let nextId = 0;

export const useConversationStore = create<ConversationStore>((set) => ({
  lines: [],
  connected: false,
  ready: false,
  muted: false,
  paused: false,
  appendLog: (raw, at) =>
    set((state) => {
      const { kind, text } = parseLogLine(raw);
      if (!text) return state;
      const line: LogLine = { id: nextId++, kind, text, at: at ?? Date.now() / 1000 };
      const lines = [...state.lines, line];
      return { lines: lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines };
    }),
  setConnected: (connected) => set(connected ? { connected } : { connected, ready: false }),
  setStatus: ({ muted, paused, ready }) =>
    set((state) => ({
      muted: muted ?? state.muted,
      paused: paused ?? state.paused,
      ready: ready ?? state.ready,
    })),
  clear: () => set({ lines: [] }),
}));
