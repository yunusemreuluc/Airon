import type { NextConfig } from 'next';

// Kullanıcı isteğiyle (2026-07-29) — Aıron artık tarayıcıda değil, kendi masaüstü
// penceresinde açılıyor (bkz. kökteki desktop.py). Bunun için arayüz STATİK olarak
// dışa aktarılıyor: `next build` → frontend/out/ altında saf HTML/CSS/JS.
//
// Neden statik export: masaüstü sürümünde çalışma zamanında Node sunucusu olmasın.
// Uygulama açılışı tek bir Python süreci (FastAPI + pencere) — arayüzü backend
// doğrudan dosya olarak sunuyor (bkz. backend/main.py). Bu mümkün, çünkü uygulama
// tek sayfa ve tamamen istemci taraflı ('use client'); sunucu tarafı veri çekme,
// route handler veya middleware kullanmıyor.
//
// `npm run dev` bundan etkilenmez — geliştirme akışı aynı.
const nextConfig: NextConfig = {
  output: 'export',
};

export default nextConfig;
