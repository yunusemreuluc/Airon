'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { LuCrosshair, LuPlay, LuPlus, LuSquare, LuTrash2, LuTriangleAlert } from 'react-icons/lu';
import {
  addMacroTarget,
  deleteMacroTarget,
  fetchMacroStatus,
  probeMacro,
  readFileAsDataUrl,
  startMacro,
  stopMacro,
  targetImageUrl,
  updateMacroSettings,
  updateMacroTarget,
  type MacroAction,
  type MacroStatus,
  type MacroTarget,
  type ProbeResult,
} from '@/services/macroApi';

// Makro modülü — şablon eşleştirmeli otomatik tıklama (core/macro_engine.py).
//
// Çalışırken sık, boştayken seyrek yenileniyor: makro aktifken skorlar ve eylem
// sayacı canlı akmalı, boştayken saniyede bir istek atmanın anlamı yok.
const REFRESH_RUNNING_MS = 900;
const REFRESH_IDLE_MS = 4000;

// core/macro_engine.py DISTINCTIVENESS_MIN ile aynı değer. Ölçüldü: tekdüze
// bir şablon 1920x1080 ekranda 1.7 milyon noktada eşleşiyor.
const DISTINCTIVENESS_MIN = 12;

const ACTION_LABELS: Record<MacroAction, string> = {
  sol: 'Sol tık',
  sag: 'Sağ tık',
  cift: 'Çift tık',
  tus: 'Tuşa bas',
  dur: 'Görünce dur',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-foreground-secondary text-[10px]">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'border-border-subtle numeric text-foreground w-[74px] rounded-[7px] border bg-white/[0.04] px-1.5 py-1 text-right text-[10px] outline-none focus:border-border-strong';

export function MacroPanelContent() {
  const [status, setStatus] = useState<MacroStatus | null>(null);
  const [probe, setProbe] = useState<ProbeResult[] | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Eylemlerden sonra elle yenileme (düğme işleyicileri kullanıyor). */
  const refresh = useCallback(async () => {
    const data = await fetchMacroStatus();
    if (data) setStatus(data);
  }, []);

  // Periyodik yenileme. `running` bilerek türetilmiş bir BOOLEAN: `status`
  // nesnesinin kendisine bağlansaydı her yoklamada kimliği değişip zamanlayıcı
  // sürekli kurulup yıkılırdı. setState `.then()` içinde çağrılıyor — effect
  // gövdesinde senkron setState cascading render'a yol açıyor
  // (react-hooks/set-state-in-effect).
  const running = status?.running ?? false;
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchMacroStatus().then((data) => {
        if (!cancelled && data) setStatus(data);
      });
    };
    load();
    const timer = window.setInterval(load, running ? REFRESH_RUNNING_MS : REFRESH_IDLE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [running]);

  if (!status) {
    return <p className="text-foreground-disabled text-xs">Makro durumu okunuyor...</p>;
  }

  if (!status.available) {
    return (
      <p className="text-foreground-secondary text-xs leading-relaxed">
        Makro motoru çalışamıyor: {status.unavailableReason}. Eksik paket kurulunca burası açılır.
      </p>
    );
  }

  const run = async (fn: () => Promise<{ success: boolean; message: string }>) => {
    setBusy(true);
    const result = await fn();
    setNotice(result.message);
    await refresh();
    setBusy(false);
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await addMacroTarget({
        name: file.name.replace(/\.[^.]+$/, ''),
        image: dataUrl,
      });
      setNotice(result.message);
      await refresh();
    } catch {
      setNotice('Dosya okunamadı.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const patchTarget = async (id: string, changes: Partial<MacroTarget>) => {
    await updateMacroTarget(id, changes);
    await refresh();
  };

  const probeFor = (id: string) => probe?.find((item) => item.targetId === id);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Durum ve kontrol ─────────────────────────────────────────── */}
      <div className="border-border-subtle flex flex-col gap-2.5 rounded-[10px] border bg-white/[0.03] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            {status.running ? (
              <motion.span
                className="bg-primary h-1.5 w-1.5 rounded-full"
                animate={{ opacity: [0.35, 1, 0.35] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              />
            ) : (
              <span className="bg-foreground-disabled h-1.5 w-1.5 rounded-full" />
            )}
            <span className="text-foreground text-[11px] font-medium">
              {status.running ? 'Çalışıyor' : 'Durdu'}
            </span>
          </span>
          <span className="numeric text-foreground-disabled text-[10px]">
            {status.running
              ? `${status.elapsedSeconds.toFixed(0)} sn · ${status.actionCount} eylem`
              : status.stopReason || 'hazır'}
          </span>
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(status.running ? stopMacro : startMacro)}
            className={`ease-out-quint flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border px-2 py-1.5 text-[11px] font-medium transition-all duration-200 active:scale-95 disabled:opacity-40 ${
              status.running
                ? 'border-border-strong text-foreground bg-white/[0.07] hover:bg-white/[0.1]'
                : 'border-border-subtle text-primary bg-white/[0.04] hover:bg-white/[0.07]'
            }`}
          >
            {status.running ? <LuSquare size={11} /> : <LuPlay size={11} />}
            {status.running ? 'Durdur' : 'Başlat'}
          </button>
          <button
            type="button"
            disabled={busy || status.running}
            onClick={async () => {
              setBusy(true);
              const result = await probeMacro();
              setProbe(result.data?.results ?? []);
              setNotice(result.message);
              setBusy(false);
            }}
            title="Tıklamadan tek tarama — eşik ayarlamak için"
            className="border-border-subtle text-foreground-secondary hover:text-foreground ease-out-quint flex items-center gap-1.5 rounded-[8px] border bg-white/[0.04] px-2 py-1.5 text-[11px] transition-all duration-200 hover:bg-white/[0.07] active:scale-95 disabled:opacity-40"
          >
            <LuCrosshair size={11} />
            Dene
          </button>
        </div>

        {status.running && (
          <p className="text-foreground-secondary text-[10px] leading-snug">
            Durdurmak için <strong className="text-foreground font-medium">F12</strong> — panele
            dönmene gerek yok.
          </p>
        )}
      </div>

      {notice && <p className="text-foreground-secondary text-[10px] leading-snug">{notice}</p>}

      {/* ── Hedefler ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="label-micro">Hedefler</span>
          <span className="numeric text-foreground-disabled text-[10px]">
            {status.targets.length}
          </span>
        </div>

        {status.targets.length === 0 ? (
          <p className="text-foreground-secondary text-[11px] leading-relaxed">
            Henüz hedef yok. Tıklatmak istediğin şeyin kırpılmış görüntüsünü ekle — düz renk
            alanlar değil, detaylı ve kenarları belirgin bir bölge seç.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {status.targets.map((target) => {
              const live = status.bestScores[target.id];
              const test = probeFor(target.id);
              const flat = target.distinctiveness < DISTINCTIVENESS_MIN;
              const open = expandedId === target.id;

              return (
                <li
                  key={target.id}
                  className="border-border-subtle flex flex-col rounded-[10px] border bg-white/[0.03]"
                >
                  <div className="flex items-center gap-2 px-2 py-2">
                    <button
                      type="button"
                      onClick={() => void patchTarget(target.id, { enabled: !target.enabled })}
                      title={target.enabled ? 'Kapat' : 'Aç'}
                      className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                        target.enabled ? 'bg-primary' : 'bg-foreground-disabled'
                      }`}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={targetImageUrl(target.id)}
                      alt=""
                      className="border-border-subtle h-7 w-11 shrink-0 rounded-[5px] border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setExpandedId(open ? null : target.id)}
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                    >
                      <span className="text-foreground w-full truncate text-[11px] leading-snug">
                        {target.name}
                      </span>
                      <span className="numeric text-foreground-disabled text-[10px]">
                        {ACTION_LABELS[target.action]} · eşik {target.threshold.toFixed(2)}
                        {live !== undefined && ` · şu an ${live.toFixed(2)}`}
                      </span>
                    </button>
                    {flat && (
                      <LuTriangleAlert
                        size={12}
                        className="shrink-0 text-amber-400/80"
                        title={`Ayırt edicilik ${target.distinctiveness} — fazla düz, yanlış tıklayabilir`}
                      />
                    )}
                  </div>

                  {test && (
                    <p
                      className={`border-border-subtle numeric border-t px-2 py-1 text-[10px] ${
                        test.error || test.ambiguous
                          ? 'text-amber-400/90'
                          : test.found
                            ? 'text-primary'
                            : 'text-foreground-disabled'
                      }`}
                    >
                      {test.error
                        ? test.error
                        : test.found
                          ? `bulundu ${test.score?.toFixed(3)} → (${test.x},${test.y})${
                              test.ambiguous ? ` · ${test.candidates} yerde uyuyor` : ''
                            }`
                          : `bulunamadı — en iyi ${test.score?.toFixed(3)}, eşik ${test.threshold?.toFixed(2)}`}
                    </p>
                  )}

                  {open && (
                    <div className="border-border-subtle flex flex-col gap-1.5 border-t px-2 py-2">
                      <Field label="Eylem">
                        <select
                          value={target.action}
                          onChange={(e) =>
                            void patchTarget(target.id, { action: e.target.value as MacroAction })
                          }
                          className={inputClass}
                        >
                          {Object.entries(ACTION_LABELS).map(([value, label]) => (
                            <option key={value} value={value} className="bg-[#10131a]">
                              {label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {target.action === 'tus' && (
                        <Field label="Tuş">
                          <input
                            defaultValue={target.key}
                            onBlur={(e) => void patchTarget(target.id, { key: e.target.value })}
                            placeholder="f1"
                            className={inputClass}
                          />
                        </Field>
                      )}
                      <Field label="Eşik (0-1)">
                        <input
                          type="number"
                          step="0.01"
                          min="0.5"
                          max="0.99"
                          defaultValue={target.threshold}
                          onBlur={(e) =>
                            void patchTarget(target.id, { threshold: Number(e.target.value) })
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Bekleme (ms)">
                        <input
                          type="number"
                          step="100"
                          min="0"
                          defaultValue={target.cooldown_ms}
                          onBlur={(e) =>
                            void patchTarget(target.id, { cooldown_ms: Number(e.target.value) })
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Ofset X / Y">
                        <span className="flex gap-1">
                          <input
                            type="number"
                            defaultValue={target.offset_x}
                            onBlur={(e) =>
                              void patchTarget(target.id, { offset_x: Number(e.target.value) })
                            }
                            className={`${inputClass} w-[35px]`}
                          />
                          <input
                            type="number"
                            defaultValue={target.offset_y}
                            onBlur={(e) =>
                              void patchTarget(target.id, { offset_y: Number(e.target.value) })
                            }
                            className={`${inputClass} w-[35px]`}
                          />
                        </span>
                      </Field>
                      <Field label="Sıra">
                        <input
                          type="number"
                          defaultValue={target.priority}
                          onBlur={(e) =>
                            void patchTarget(target.id, { priority: Number(e.target.value) })
                          }
                          className={inputClass}
                        />
                      </Field>
                      {flat && (
                        <p className="text-[10px] leading-snug text-amber-400/80">
                          Ayırt edicilik {target.distinctiveness} — bu görsel fazla düz. Ekranda
                          birçok yere uyar ve yanlış yere tıklar. Daha detaylı bir bölge kırp.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteMacroTarget(target.id);
                          setExpandedId(null);
                          await refresh();
                        }}
                        className="text-foreground-disabled mt-0.5 flex items-center gap-1.5 self-start text-[10px] transition-colors hover:text-red-400"
                      >
                        <LuTrash2 size={10} />
                        Sil
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onPickFile(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy || status.running}
          onClick={() => fileRef.current?.click()}
          className="border-border-subtle text-foreground-secondary hover:text-foreground ease-out-quint flex items-center justify-center gap-1.5 rounded-[8px] border border-dashed bg-white/[0.02] px-2 py-2 text-[11px] transition-all duration-200 hover:bg-white/[0.05] active:scale-95 disabled:opacity-40"
        >
          <LuPlus size={12} />
          Görsel ekle
        </button>
      </div>

      {/* ── Ayarlar ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <span className="label-micro">Ayarlar</span>
        <div className="border-border-subtle flex flex-col gap-1.5 rounded-[10px] border bg-white/[0.03] px-2.5 py-2">
          <Field label="Tarama aralığı (ms)">
            <input
              type="number"
              step="50"
              min="50"
              defaultValue={status.settings.scan_interval_ms}
              onBlur={async (e) => {
                await updateMacroSettings({ scan_interval_ms: Number(e.target.value) });
                await refresh();
              }}
              className={inputClass}
            />
          </Field>
          <Field label="En fazla süre (sn)">
            <input
              type="number"
              step="30"
              min="5"
              defaultValue={status.settings.max_runtime_s}
              onBlur={async (e) => {
                await updateMacroSettings({ max_runtime_s: Number(e.target.value) });
                await refresh();
              }}
              className={inputClass}
            />
          </Field>
          <Field label="En fazla eylem">
            <input
              type="number"
              step="10"
              min="1"
              defaultValue={status.settings.max_actions}
              onBlur={async (e) => {
                await updateMacroSettings({ max_actions: Number(e.target.value) });
                await refresh();
              }}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      {/* ── Son eylemler ─────────────────────────────────────────────── */}
      {status.log.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="label-micro">Son eylemler</span>
          <ul className="flex flex-col gap-1">
            {status.log
              .slice()
              .reverse()
              .map((entry, index) => (
                <li
                  key={`${entry.at}-${index}`}
                  className={`numeric flex gap-2 text-[10px] leading-snug ${
                    entry.kind === 'error'
                      ? 'text-amber-400/90'
                      : entry.kind === 'stop'
                        ? 'text-foreground-secondary'
                        : 'text-foreground-disabled'
                  }`}
                >
                  <span className="shrink-0">{entry.at.toFixed(1)}s</span>
                  <span className="min-w-0 break-words">{entry.text}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
