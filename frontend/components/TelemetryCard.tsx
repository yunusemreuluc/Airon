'use client';

import { useEffect, useState } from 'react';
import { LuBatteryCharging, LuCpu, LuHardDrive, LuMemoryStick } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { apiBase } from '@/services/voiceApi';
import { GlassPanel } from './GlassPanel';

// Sistem telemetrisi — CLAUDE.md § TOP BAR'ın karşılığı.
//
// TARİHÇE ÖNEMLİ: bu bilgi 2026-07-28'de kullanıcı isteğiyle ekranın üstünden
// KALDIRILMIŞTI, çünkü sahneyi kapatan bir çubuktu. 2026-07-30'da yüzen kart
// olarak geri geldi; 2026-07-31'de kullanıcı isteğiyle tepsi düğmesinin YANINA,
// tek satırlık kompakt bir şeride indirildi. Tam genişlikte bir kart, dört
// sayı göstermek için sağ kolonun 60 pikselini yiyordu.
//
// GPU ve sıcaklık YOK: Windows'ta psutil ikisini de güvenilir veremiyor
// (bkz. backend/api/system.py). Boş bir "GPU —" satırı, olmayan bir yeteneği
// varmış gibi gösterirdi.
const REFRESH_MS = 3000;

interface Telemetry {
  cpu?: number;
  ram?: number;
  disk?: number;
  battery?: number;
  charging?: boolean;
}

export function TelemetryCard() {
  const [data, setData] = useState<Telemetry | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`${apiBase()}/api/system/telemetry`);
        const result = (await response.json()) as { success?: boolean; data?: Telemetry };
        if (!cancelled && result.success && result.data) setData(result.data);
      } catch {
        // Backend kapalıysa kart sessizce gizli kalır — hata göstermeye değmez.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Veri yokken kart hiç çizilmiyor: "—" dolu bir iskelet, sağ kolonda yer
  // kaplayan ama hiçbir şey söylemeyen bir kutu olurdu.
  if (!data || data.cpu === undefined) return null;

  return (
    // h-[38px]: tepsi düğmesiyle aynı yükseklik — ikisi tek bir kontrol şeridi
    // gibi hizalansın diye.
    <GlassPanel
      className="flex h-[38px] items-center gap-2.5 px-3"
      style={{ borderRadius: 999 }}
    >
      <Metric icon={LuCpu} label="CPU" value={data.cpu} />
      <Divider />
      <Metric icon={LuMemoryStick} label="RAM" value={data.ram} />
      <Divider />
      <Metric icon={LuHardDrive} label="Disk" value={data.disk} />
      {data.battery !== undefined && (
        <>
          <Divider />
          <Metric
            icon={LuBatteryCharging}
            label="Pil"
            value={data.battery}
            // Şarjdayken vurgulu: bilgi taşıyan tek renk kullanımı.
            highlight={data.charging}
            // Pil AZALDIKÇA kritikleşiyor — diğer metriklerin tersi.
            inverted
          />
        </>
      )}
    </GlassPanel>
  );
}

function Divider() {
  return <span className="bg-border-subtle h-3.5 w-px shrink-0" />;
}

// Eşikler: bu değerin üstü "yük altında" demek. Pil için ters çalışıyor.
const WARN_THRESHOLD = 85;
const LOW_BATTERY = 20;

function Metric({
  icon: Icon,
  label,
  value,
  highlight = false,
  inverted = false,
}: {
  icon: IconType;
  label: string;
  value: number | undefined;
  highlight?: boolean;
  inverted?: boolean;
}) {
  if (value === undefined) return null;

  const isCritical = inverted ? value <= LOW_BATTERY : value >= WARN_THRESHOLD;
  const color = isCritical
    ? 'text-[#ff8f8f]'
    : highlight
      ? 'text-primary'
      : 'text-foreground-secondary';

  // Yatay ve kompakt: şeritte dolum çubuğuna yer yok, ikon + sayı yeterli.
  // Etiket (`CPU`, `RAM`) yalnızca title'da — dört kısaltmayı yan yana yazmak
  // şeridi iki katına çıkarır ve ikonlar zaten aynı bilgiyi taşıyor.
  return (
    <span className="flex shrink-0 items-center gap-1.5" title={`${label} %${Math.round(value)}`}>
      <Icon size={12} strokeWidth={1.7} className={`shrink-0 ${color}`} />
      <span className={`numeric text-[10px] leading-none ${color}`}>{Math.round(value)}%</span>
    </span>
  );
}
