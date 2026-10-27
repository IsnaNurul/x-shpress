import * as Location from "expo-location";

// Nominatim (OpenStreetMap) -- reverse geocoding open source, gratis, nggak butuh API key.
// Kebijakan pakainya: maks 1 request/detik & wajib kirim User-Agent yang jelas. Pemakaian kita
// di sini cuma 1x per Pengecekan per driver per hari, jauh di bawah batas itu.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const NOMINATIM_HEADERS = { "User-Agent": "XSHPRESS-KurirApp/1.0 (xsha.id)" };

async function reverseGeocode(latitude, longitude) {
  try {
    const url = `${NOMINATIM_URL}?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const json = await res.json();
    return json.display_name || null;
  } catch (err) {
    console.error("Gagal reverse geocode lewat Nominatim:", err);
    return null;
  }
}

// Tangkap lokasi (lat/long + alamat teks) DIAM-DIAM di background -- dipanggil pas submit aksi
// yg butuh bukti lokasi (mis. Pengecekan Kendaraan), tanpa ada langkah/tombol terpisah yg keliatan
// ke driver. Izinnya sendiri udah diminta SEKALI di awal lewat LocationPermissionGate (wajib
// aktif sebelum app bisa dipakai), jadi di sini CUMA cek status -- jangan request lagi, biar
// nggak muncul popup izin mendadak pas driver lagi input. Kalau entah kenapa statusnya nggak
// granted (jarang, mis. dicabut manual pas app lagi foreground) atau GPS/internetnya gagal,
// balikin null -- pemanggil JANGAN blokir aksi utamanya gara2 ini (foto/data lain tetap wajib
// tersimpan).
export async function captureLocationSilently() {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude } = position.coords;
    const address = await reverseGeocode(latitude, longitude);
    return { latitude, longitude, address };
  } catch (err) {
    console.error("Gagal ambil lokasi:", err);
    return null;
  }
}
