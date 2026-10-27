import AsyncStorage from "@react-native-async-storage/async-storage";

export const STORAGE_KEYS = {
  profile: "xsha_profile",
  deliveries: "xsha_deliveries_v12",
  expenses: "xsha_expenses_v3",
  kendala: "xsha_kendala",
  pengecekan: "xsha_pengecekan",
  cuciKendaraan: "xsha_cuci_kendaraan",
  driverLogEntries: "xsha_driver_log_entries",
  auth: "xsha_auth_logged_in",
  erpAuth: "xsha_erp_auth", // { usr, apiKey, apiSecret, driverId } milik akun ERP yg sedang login
  syncQueue: "xsha_sync_queue", // antrian aksi yg gagal kekirim ke ERP (offline) -- lihat utils/syncQueue.js
};

export async function loadJSON(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

export async function saveJSON(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

// Semua field identitas di sini (nama, idKurir, telepon) murni dari ERP (Employee), diisi
// otomatis pas login & TIDAK bisa diedit manual dari mobile -- supaya tidak ada data "palsu"
// yg keliatan seperti data server tapi sebenarnya cuma tersimpan di HP.
export function defaultProfile() {
  return {
    nama: "",
    idKurir: "",
    telepon: "",
    themePref: "system", // system | light | dark -- preferensi tampilan HP, bukan data kurir
  };
}
