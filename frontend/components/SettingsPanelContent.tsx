'use client';

import { useEffect, useState } from 'react';
import { LuCheck, LuExternalLink, LuKeyRound, LuSmartphone, LuVolume2 } from 'react-icons/lu';
import {
  createDesktopShortcut,
  fetchSettings,
  saveSettings,
  setStartupEnabled,
  type Settings,
} from '@/services/settingsApi';
import { configureSfx, playSfx } from '@/services/sfxPlayer';
import { fetchRemoteConfig, saveRemotePin, type RemoteConfig } from '@/services/remoteApi';

// Tkinter penceresindeki ayar paneli (API AYARLARI / SFX ON / FX LEVEL / VOICE /
// AÇILIŞTA BAŞLAT / MASAÜSTÜNE KISAYOL / tepsiye al) kullanıcı isteğiyle
// (2026-07-29) buraya taşındı. Davranış aynı, dil yeni: aynı cam yüzeyler,
// aynı tek vurgu rengi, aynı mikro etiket ritmi.
export function SettingsPanelContent() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [remoteConfig, setRemoteConfig] = useState<RemoteConfig | null>(null);
  const [pinDraft, setPinDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchSettings().then((data) => {
      if (cancelled || !data) return;
      setSettings(data);
      configureSfx({ enabled: data.sfxEnabled, volume: data.sfxVolume });
    });
    void fetchRemoteConfig().then((data) => {
      if (!cancelled && data) setRemoteConfig(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tek yerden güncelleme: önce arayüzü (anında tepki), sonra diske yaz.
  const patch = async (changes: Partial<Settings> & { geminiApiKey?: string }, message: string) => {
    setSettings((current) => (current ? { ...current, ...changes } : current));
    const result = await saveSettings(changes);
    setNotice(result.success ? message : result.message);
  };

  if (!settings) {
    return <p className="text-foreground-secondary text-xs">Ayarlar yükleniyor...</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <Section title="Gemini">
        <div className="flex items-center justify-between gap-2">
          <span className="text-foreground-secondary flex items-center gap-2 text-xs">
            <LuKeyRound
              size={13}
              strokeWidth={1.7}
              className={settings.hasApiKey ? 'text-primary' : ''}
            />
            {settings.hasApiKey ? `Anahtar girili (${settings.apiKeyMasked})` : 'Anahtar yok'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={apiKeyDraft}
            onChange={(event) => setApiKeyDraft(event.target.value)}
            placeholder={settings.hasApiKey ? 'Yeni anahtar...' : 'Gemini API anahtarı'}
            className="border-border-subtle text-foreground placeholder:text-foreground-disabled focus-visible:border-primary/50 min-w-0 flex-1 rounded-full border bg-white/[0.04] px-3.5 py-2 text-xs transition-colors duration-200"
          />
          <SmallButton
            disabled={!apiKeyDraft.trim()}
            onClick={() => {
              void patch(
                { geminiApiKey: apiKeyDraft.trim(), hasApiKey: true },
                'Anahtar kaydedildi',
              );
              setApiKeyDraft('');
            }}
          >
            <LuCheck size={13} strokeWidth={2} />
          </SmallButton>
        </div>
      </Section>

      {/* Uzaktan erişim (2026-09-15) — telefondan girişte sorulan PIN. Yalnızca
          burada, PC'de değiştirilebilir (bkz. backend/api/remote.py). Tailscale
          kurulumu Notes/Uzaktan-Erisim.md içinde. */}
      {remoteConfig && (
        <Section title="Uzaktan erişim">
          <span className="text-foreground-secondary flex items-center gap-2 text-xs">
            <LuSmartphone
              size={13}
              strokeWidth={1.7}
              className={remoteConfig.pinSet ? 'text-primary' : ''}
            />
            {remoteConfig.pinSet ? 'Telefon PIN’i ayarlı' : 'PIN yok — telefon girişi kapalı'}
          </span>
          <div className="flex items-center gap-2">
            <input
              type="password"
              inputMode="numeric"
              value={pinDraft}
              onChange={(event) =>
                setPinDraft(event.target.value.replace(/\D/g, '').slice(0, remoteConfig.maxPinLength))
              }
              placeholder={
                remoteConfig.pinSet
                  ? 'Yeni PIN...'
                  : `${remoteConfig.minPinLength}-${remoteConfig.maxPinLength} haneli PIN`
              }
              className="border-border-subtle text-foreground placeholder:text-foreground-disabled focus-visible:border-primary/50 min-w-0 flex-1 rounded-full border bg-white/[0.04] px-3.5 py-2 text-xs transition-colors duration-200"
            />
            <SmallButton
              disabled={pinDraft.length < remoteConfig.minPinLength}
              onClick={async () => {
                const result = await saveRemotePin(pinDraft);
                setNotice(result.message);
                if (result.success) {
                  setPinDraft('');
                  setRemoteConfig((current) => (current ? { ...current, pinSet: true } : current));
                }
              }}
            >
              <LuCheck size={13} strokeWidth={2} />
            </SmallButton>
          </div>
        </Section>
      )}

      <Section title="Ses">
        <div className="grid grid-cols-3 gap-1.5">
          {settings.voices.map((voice) => (
            <button
              key={voice}
              type="button"
              onClick={() => void patch({ voice }, `Ses: ${voice}`)}
              className={`rounded-full border px-2 py-1.5 text-[11px] transition-all duration-200 ${
                voice === settings.voice
                  ? 'border-primary/40 text-primary bg-primary/10'
                  : 'border-border-subtle text-foreground-secondary hover:text-foreground bg-white/[0.04]'
              }`}
            >
              {voice}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Efektler">
        <Toggle
          label="Ses efektleri"
          value={settings.sfxEnabled}
          onChange={(value) => {
            configureSfx({ enabled: value });
            if (value) playSfx('success'); // açınca hemen duyulsun
            void patch({ sfxEnabled: value }, value ? 'Efektler açık' : 'Efektler kapalı');
          }}
        />
        <div className="flex items-center gap-3">
          <LuVolume2 size={13} strokeWidth={1.7} className="text-foreground-disabled shrink-0" />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.sfxVolume * 100)}
            onChange={(event) => {
              const volume = Number(event.target.value) / 100;
              configureSfx({ volume });
              setSettings((current) => (current ? { ...current, sfxVolume: volume } : current));
            }}
            // Kaydırırken her piksel için diske yazmamak için: yazma bırakınca.
            onPointerUp={() => void patch({ sfxVolume: settings.sfxVolume }, 'Seviye kaydedildi')}
            onKeyUp={() => void patch({ sfxVolume: settings.sfxVolume }, 'Seviye kaydedildi')}
            className="accent-primary h-1 min-w-0 flex-1 cursor-pointer"
          />
          <span className="numeric text-foreground-secondary w-9 shrink-0 text-right text-[11px]">
            {Math.round(settings.sfxVolume * 100)}%
          </span>
        </div>
      </Section>

      <Section title="Windows">
        <Toggle
          label="Açılışta başlat"
          value={settings.startupEnabled}
          onChange={async (value) => {
            setSettings((current) => (current ? { ...current, startupEnabled: value } : current));
            const result = await setStartupEnabled(value);
            setNotice(result.message);
          }}
        />
        {/* "Tepsiye al" kullanıcı isteğiyle (2026-07-30) buradan çıkarıldı ve
            sahnenin sağ üstüne sabit bir kontrol olarak taşındı — sık kullanılan
            bir eylem için panelin dibinde gömülü durmamalı.
            Bkz. components/TrayControl.tsx. */}
        <ActionButton
          icon={LuExternalLink}
          label={settings.shortcutExists ? 'Kısayolu yenile' : 'Masaüstüne kısayol'}
          onClick={async () => {
            const result = await createDesktopShortcut();
            setNotice(result.message);
            if (result.success) {
              setSettings((current) => (current ? { ...current, shortcutExists: true } : current));
            }
          }}
        />
      </Section>

      {notice && <p className="text-foreground-disabled text-[11px]">{notice}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="label-micro">{title}</span>
      {children}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="group flex items-center justify-between gap-3"
    >
      <span className="text-foreground-secondary group-hover:text-foreground text-xs transition-colors duration-200">
        {label}
      </span>
      <span
        className={`relative h-[18px] w-8 shrink-0 rounded-full border transition-all duration-200 ${
          value ? 'border-primary/50 bg-primary/25' : 'border-border-subtle bg-white/[0.05]'
        }`}
      >
        <span
          className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-all duration-200 ease-out ${
            value ? 'bg-primary left-[15px]' : 'bg-foreground-disabled left-[2px]'
          }`}
          style={value ? { boxShadow: '0 0 8px var(--color-primary)' } : undefined}
        />
      </span>
    </button>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-border-subtle text-foreground-secondary hover:text-foreground hover:border-primary/40 flex flex-1 items-center justify-center gap-2 rounded-full border bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium transition-all duration-200"
    >
      <Icon size={12} strokeWidth={1.8} />
      {label}
    </button>
  );
}

function SmallButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="border-border-subtle text-foreground-secondary hover:text-primary hover:border-primary/40 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white/[0.04] transition-all duration-200 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
