'use client';

import { useEffect, useState } from 'react';
import {
  LuBatteryCharging,
  LuCpu,
  LuHardDrive,
  LuMemoryStick,
  LuWifi,
  LuWifiOff,
} from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { fetchData } from '@/services/apiClient';
import { GlassPanel } from './GlassPanel';

// Sistem telemetrisi — Notes/Tasarim-Kurallari.md § Panel yerleşimi'ın karşılığı.
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
//
// İNTERNET ve SAAT 2026-07-31'de eklendi. İkisi de gerçek: internet backend'in
// attığı bir TCP bağlantısından (bkz. backend/api/system.py `_probe_internet`),
// saat de cihazın kendisinden. Çevrimdışıyken alan gizlenmiyor — GPU/sıcaklıktan
// farkı bu: onları ÖLÇEMİYORUZ, bunu ölçebiliyoruz ve cevap "hayır".
const REFRESH_MS = 3000;

interface NetStatus {
  online: boolean;
  latency?: number;
}

interface Telemetry {
  cpu?: number;
  ram?: number;
  disk?: number;
  battery?: number;
  charging?: boolean;
  net?: NetStatus;
}

/**
 * Dakika başına HİZALI saat.
 *
 * `setInterval(…, 1000)` daha kısa olurdu ama saniyede bir render tetikler ve
 * gösterilen değer dakikada yalnızca bir kez değişir — 59 render boş yere.
 * Burada bir sonraki dakikaya kalan süre hesaplanıp o an uyanılıyor, yani
 * render sayısı gösterilen bilgiyle birebir. Sahne 60 FPS hedefliyor; onunla
 * aynı ana iş parçacığında saniyede bir gereksiz render biriktirmek istemiyoruz.
 */
function useClock(): string {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number;
    const schedule = () => {
      const date = new Date();
      setNow(date);
      // +50 ms pay: tam sınırda uyanmak bazen hâlâ önceki dakikayı okuyor.
      const msToNextMinute = 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds()) + 50;
      timer = window.setTimeout(schedule, msToNextMinute);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  return now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export function TelemetryCard() {
  const [data, setData] = useState<Telemetry | null>(null);
  const clock = useClock();

  useEffect(() => {
    let cancelled = false;
    // Backend kapalıysa `fetchData` null döner, kart sessizce gizli kalır —
    // hata göstermeye değmez.
    const load = async () => {
      const telemetry = await fetchData<Telemetry>('/api/system/telemetry');
      if (!cancelled && telemetry) setData(telemetry);
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
    <GlassPanel className="flex h-[38px] items-center gap-2.5 px-3" style={{ borderRadius: 999 }}>
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
      {data.net && (
        <>
          <Divider />
          <NetMetric net={data.net} />
        </>
      )}
      <Divider />
      {/* Saat şeridin SONUNDA: her arayüzde olduğu yer orası, ve yüzdelerden
          ayrı bir bilgi türü olduğu için sayıların arasına karışmamalı. */}
      <span className="numeric text-foreground-secondary shrink-0 text-[10px] leading-none">
        {clock}
      </span>
    </GlassPanel>
  );
}

// Yüzde DEĞİL, bu yüzden `Metric` kullanılmıyor: internetin ölçüsü gecikme.
// Çevrimdışıyken sayı yerine üstü çizili ikon ve "yok" — sıfır ms göstermek
// "0 ms gecikme" gibi okunur, ki bu bağlantının en iyi hâli olurdu.
function NetMetric({ net }: { net: NetStatus }) {
  if (!net.online) {
    return (
      <span className="flex shrink-0 items-center gap-1.5" title="İnternet yok">
        <LuWifiOff size={12} strokeWidth={1.7} className="shrink-0 text-[#ff8f8f]" />
        <span className="text-[10px] leading-none text-[#ff8f8f]">yok</span>
      </span>
    );
  }

  // 250 ms üstü gözle fark edilen bir gecikme — sesli asistan için anlamlı eşik.
  const isSlow = (net.latency ?? 0) >= 250;
  const color = isSlow ? 'text-[#ff8f8f]' : 'text-foreground-secondary';

  return (
    <span className="flex shrink-0 items-center gap-1.5" title={`İnternet ${net.latency} ms`}>
      <LuWifi size={12} strokeWidth={1.7} className={`shrink-0 ${color}`} />
      <span className={`numeric text-[10px] leading-none ${color}`}>{net.latency}ms</span>
    </span>
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
