'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

// Performans. Kullanıcı işletim sistemi düzeyinde
// "az hareket" istediyse (erişilebilirlik + güç tasarrufu), sürekli çalışan
// rAF döngülerini (parallax vb.) ve uzun giriş animasyonlarını (BootOverlay)
// atlıyoruz. useSyncExternalStore — tarayıcı API'sine (matchMedia) abone olmak
// için React'in kendi önerdiği yol, useEffect+setState'ten farklı olarak
// render-saflığı kurallarına takılmıyor.
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
