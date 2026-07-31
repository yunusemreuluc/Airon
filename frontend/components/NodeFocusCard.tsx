'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { LuX } from 'react-icons/lu';
import { AI_STATE_LABELS, useAIStateStore } from '@/stores/aiStateStore';
import { useNodeFocusStore } from '@/stores/nodeFocusStore';
import { ORBIT_NODES } from '@/three/nodeData';
import { GlassPanel } from './GlassPanel';

// Kullanıcı isteğiyle (2026-07-27) — "Aktif/seçili düğüm için sağ tarafta detaylı
// bir pop-up kartı aç: görev adı, alt görev, yüzdelik performans/verimlilik barı."
// Sabit/uydurma bir yüzde göstermek yerine (henüz gerçek bir metrik kaynağı yok —
// "don't fabricate data" ilkesi), bar indeterminate/canlı bir tarama animasyonu
// olarak "işleniyor" hissini veriyor; alt yazı gerçek AI durumunu (aiStateStore)
// gösteriyor.
export function NodeFocusCard() {
  const focusedNodeId = useNodeFocusStore((state) => state.focusedNodeId);
  const setFocusedNode = useNodeFocusStore((state) => state.setFocusedNode);
  const aiState = useAIStateStore((state) => state.aiState);
  // "Görme" düğümü BİLEREK dışarıda: ona tıklandığında bu genel açıklama kartı
  // yerine gerçek Vision paneli açılıyor (kullanıcı isteği, 2026-07-31).
  // Modülün kendisi varken onu anlatan bir kart göstermek anlamsız olurdu.
  const node =
    ORBIT_NODES.find((n) => n.id === focusedNodeId && n.id !== 'vision') ?? null;

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          key={node.id}
          initial={{ opacity: 0, x: 20, filter: 'blur(6px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, x: 20, filter: 'blur(6px)' }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          // Konum AppShell'deki sağ kolonun işi (2026-07-30): tepsi kontrolü ve
          // Vision paneliyle aynı yığında, üstten alta diziliyor.
          className="w-full"
        >
          <GlassPanel variant="card" className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-[9px] border"
                  style={{ borderColor: `${node.color}33`, background: `${node.color}14` }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: node.color, boxShadow: `0 0 8px ${node.color}` }}
                  />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="label-micro">Düğüm</span>
                  <span className="text-foreground text-[13px] leading-none font-medium">
                    {node.label}
                  </span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setFocusedNode(null)}
                className="text-foreground-disabled hover:text-foreground -m-1 rounded-full p-1.5 transition-colors duration-200 hover:bg-white/[0.06]"
                aria-label="Kartı kapat"
              >
                <LuX size={13} strokeWidth={1.8} />
              </button>
            </div>

            <hr className="hairline my-4" />

            <p className="text-foreground-secondary text-xs leading-relaxed">{node.description}</p>

            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="label-micro">Durum</span>
                <span className="numeric text-foreground-secondary text-[10px] tracking-[0.12em] uppercase">
                  {AI_STATE_LABELS[aiState]}
                </span>
              </div>
              {/* Belirsiz (indeterminate) tarama barı — henüz gerçek bir metrik
                  kaynağı yok, uydurma bir yüzde göstermek yerine "işleniyor"
                  hissini veriyor. Bar zeminde silik bir yatak üzerinde kayıyor. */}
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
                <motion.div
                  className="h-full w-1/3 rounded-full"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${node.color}, transparent)`,
                    boxShadow: `0 0 10px ${node.color}80`,
                  }}
                  animate={{ x: ['-110%', '320%'] }}
                  transition={{ duration: 1.9, repeat: Infinity, ease: [0.65, 0, 0.35, 1] }}
                />
              </div>
            </div>
          </GlassPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
