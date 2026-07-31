import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

// Notes/Tasarim-Kurallari.md § Arayüz stili — "Large radius, soft glow, glass background.
// Hover: Glow, lift, scale 1.02. Click: scale 0.98. Duration: 200ms."
//
// 2026-07-28 düzenlemesi: hover'da ölçek yerine ağırlıklı olarak kenarlık +
// ışıma değişiyor. 200ms'de %2 büyüyen bir düğme "oyuncak", kenarı aydınlanan
// bir düğme "cihaz" hissi veriyor. Yükselme (translate) korundu — dokunulabilirlik
// işareti; tıklamada ölçek küçülmesi de (çok az) kaldı.
export function GlassButton({ children, className = '', ...rest }: GlassButtonProps) {
  return (
    <button
      type="button"
      className={`border-border-subtle text-foreground-secondary hover:text-foreground hover:border-primary/40 flex items-center justify-center gap-2 rounded-full border bg-white/[0.045] px-4 py-2 text-xs font-medium transition-all duration-200 ease-out hover:-translate-y-px hover:bg-white/[0.07] hover:shadow-[0_0_18px_rgba(127,178,255,0.22),inset_0_1px_0_rgba(255,255,255,0.08)] active:translate-y-0 active:scale-[0.985] disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:border-[var(--border-subtle)] disabled:hover:shadow-none ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
