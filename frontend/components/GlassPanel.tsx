import { createElement } from 'react';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

// İki yüzey katmanı (bkz. app/globals.css § YÜZEYLER):
//   panel — sahneyi göstermesi gereken hafif cam (Sidebar rayı)
//   card  — 3D sahnenin üzerinde düz metin taşıyan, daha opak içerik kartı
// Önceden "card" görünümü üç ayrı bileşende satır içi `style` ile tekrarlanıyordu.
type GlassVariant = 'panel' | 'card';

const VARIANT_CLASS: Record<GlassVariant, string> = {
  panel: 'glass-panel',
  card: 'surface-card',
};

type GlassPanelProps<T extends ElementType> = {
  as?: T;
  variant?: GlassVariant;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>;

export function GlassPanel<T extends ElementType = 'div'>({
  as,
  variant = 'panel',
  children,
  className = '',
  ...rest
}: GlassPanelProps<T>) {
  // JSX'in `<Component>` sözdizimi, T hâlâ jenerikken 'children' tipini 'never'a
  // indirgiyor (bilinen bir TS+React kısıtı) — createElement bu daralmaya uğramıyor.
  // Dıştaki GlassPanelProps<T> imzası çağıran taraf için hâlâ tam tipli.
  return createElement(
    as ?? 'div',
    { className: `${VARIANT_CLASS[variant]} ${className}`.trim(), ...rest },
    children,
  );
}
