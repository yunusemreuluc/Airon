'use client';

import { useEffect, useRef } from 'react';
import { useConversationStore, type LogKind } from '@/stores/conversationStore';

// Konuşma satırlarının görsel dili. Renk paletin tek vurgu kuralına uyuyor
// (bkz. app/globals.css): Aıron buz mavisi, kullanıcı nötr platin, sistem
// sönük, hata ise tek kırmızımsı istisna — hatanın fark edilmesi gerekiyor.
const KIND_STYLE: Record<LogKind, { label: string; className: string }> = {
  airon: { label: 'Aıron', className: 'text-primary' },
  user: { label: 'Siz', className: 'text-foreground' },
  system: { label: 'Sistem', className: 'text-foreground-secondary' },
  error: { label: 'Hata', className: 'text-[#ff8f8f]' },
};

export function ConversationLog() {
  const lines = useConversationStore((state) => state.lines);
  const bottomRef = useRef<HTMLDivElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  // Sohbet paneli her açıldığında bu bileşen yeniden mount ediliyor (dock'taki
  // AnimatePresence içinde), yani bu ref her açılışta sıfırlanıyor — tam da
  // istediğimiz şey.
  const hasJumpedToLatest = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // AÇILIŞTA: doğrudan en alta atla (kullanıcı isteği, 2026-07-31).
    // Buradaki hata şuydu: aşağıdaki "yalnızca zaten alttaysan kaydır" kuralı
    // ilk açılışta ASLA sağlanmıyordu — panel yeni mount edildiğinde scrollTop
    // 0, yani alta olan mesafe tüm liste boyu kadar. Sonuç: sohbet her açılışta
    // en eski mesajdan başlıyordu.
    // `scrollTop` doğrudan atanıyor, scrollIntoView değil: animasyonsuz olmalı,
    // açılışta listenin kayarak inmesi gereksiz bir gösteri.
    if (!hasJumpedToLatest.current) {
      hasJumpedToLatest.current = true;
      container.scrollTop = container.scrollHeight;
      return;
    }

    // Sonraki satırlarda: kullanıcı yukarı kaydırıp bir şey okuyorsa onu
    // zorla aşağı çekme.
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 80) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [lines]);

  if (lines.length === 0) {
    return (
      <p className="text-foreground-secondary text-xs leading-relaxed">
        Konuşma burada görünecek. Mikrofonun çalışmıyorsa aşağıya yazabilirsin — Aıron sana sesli
        cevap verir.
      </p>
    );
  }

  return (
    <div ref={containerRef} className="flex max-h-56 flex-col gap-2.5 overflow-y-auto pr-1">
      {lines.map((line) => {
        const style = KIND_STYLE[line.kind];
        return (
          <div key={line.id} className="flex flex-col gap-0.5">
            <span className="label-micro">{style.label}</span>
            <span className={`text-xs leading-relaxed ${style.className}`}>{line.text}</span>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
