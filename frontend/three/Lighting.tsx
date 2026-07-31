// Soğuk, "temiz oda" ışıklandırması (kullanıcı isteğiyle, 2026-07-28 — Platin +
// Buz Mavisi palet). Sert gölge yok (hiçbir ışıkta castShadow açılmıyor).
// Üç noktalı klasik kurulum, uzay ölçeğine uyarlanmış:
//   key  — sağ üstten buz mavisi ana ışık, sahnenin yönünü belirler
//   fill — sol alttan platin dolgu, key'in bıraktığı gölgeyi ölü siyah olmaktan
//          çıkarır (yoğunluğu bilerek key'in yarısından az)
//   rim  — arkadan derin mavi kenar ışığı, çekirdeği zeminden ayırır
// Ambient bilerek çok koyu ve soğuk: boşluğun kendisi ışık yaymaz.
export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.3} color="#0a1220" />
      <pointLight position={[3, 2, 4]} intensity={11} color="#7fb2ff" distance={20} decay={2} />
      <pointLight position={[-4, -2, -3]} intensity={5} color="#e8eef7" distance={20} decay={2} />
      <pointLight position={[0, 4, -6]} intensity={7} color="#4d7fd6" distance={25} decay={2} />
    </>
  );
}
