// Kategori pengeluaran — id & label "BBM"/"Toll" disamakan dgn ERPNext (Delivery Expense.expense_type).
// "Makan" adalah tambahan khusus mobile (belum ada di ERP, tapi berguna) — dipertahankan sesuai arahan.
export const EXPENSE_CATEGORIES = [
  { id: "bbm", label: "BBM", icon: { lib: "MaterialCommunityIcons", name: "gas-station-outline" }, bgKey: "redSoft" },
  { id: "toll", label: "Toll", icon: { lib: "MaterialCommunityIcons", name: "road-variant" }, bgKey: "greenSoft" },
  { id: "parkir", label: "Parkir", icon: { lib: "MaterialIcons", name: "local-parking" }, bgKey: "blueSoft" },
  { id: "makan", label: "Makan", icon: { lib: "Ionicons", name: "fast-food-outline" }, bgKey: "orangeSoft" },
  { id: "lainnya", label: "Lainnya", icon: { lib: "Ionicons", name: "ellipsis-horizontal-circle-outline" }, bgKey: "indigoSoft" },
];

export function categoryMeta(id) {
  return EXPENSE_CATEGORIES.find((c) => c.id === id) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}

// Kendala operasional umum (BUKAN alasan gagal per-pengiriman — itu sudah difasilitasi
// oleh failure_reason di ERP saat menandai stop "Gagal"). Tab ini untuk isu yang tidak
// terikat ke 1 pengiriman spesifik, mis. kendaraan/akses jalan — belum ada padanannya di ERP.
export const KENDALA_TYPES = [
  { id: "kendaraan_bermasalah", label: "Kendaraan bermasalah" },
  { id: "akses_terhalang", label: "Akses lokasi terhalang" },
  { id: "barang_rusak", label: "Barang rusak" },
  { id: "lainnya", label: "Lainnya" },
];

export function kendalaTypeLabel(id) {
  const t = KENDALA_TYPES.find((k) => k.id === id);
  return t ? t.label : "Lainnya";
}

// Jenis transit (ambil barang di outlet) -- klasifikasi lokal, belum ada field khusus di ERP
// Driver Log, jadi digabung ke teks catatan/notes saat 1 aksi Transit dicatat.
export const TRANSIT_TYPES = [
  { id: "customer", label: "Barang Customer" },
  { id: "fmcg", label: "Barang FMCG" },
  { id: "fhs", label: "Barang F&H.S" },
  { id: "mbg", label: "Barang MBG" },
  { id: "belanja", label: "Belanja" },
  { id: "lainnya", label: "Lainnya" },
];

export function transitTypeLabel(id) {
  const t = TRANSIT_TYPES.find((x) => x.id === id);
  return t ? t.label : null;
}


// 4 tipe aktivitas driver -- disamakan PERSIS dgn Select "Tipe" di doctype ERP "Driver Activity"
// (Kendala, Pengeluaran, Pengecekan, Cuci Kendaraan). Dipakai di menu "Aktivitas" gabungan.
export const ACTIVITY_TYPES = [
  { id: "kendala", label: "Kendala", erpTipe: "Kendala", icon: { name: "alert-circle-outline" } },
  { id: "pengeluaran", label: "Pengeluaran", erpTipe: "Pengeluaran", icon: { lib: "MaterialCommunityIcons", name: "wallet-outline" } },
  { id: "pengecekan", label: "Pengecekan", erpTipe: "Pengecekan", icon: { name: "checkmark-done-outline" } },
  { id: "cuci_kendaraan", label: "Cuci Kendaraan", erpTipe: "Cuci Kendaraan", icon: { lib: "MaterialCommunityIcons", name: "car-wash" } },
];

export function activityTypeMeta(id) {
  return ACTIVITY_TYPES.find((a) => a.id === id) || ACTIVITY_TYPES[0];
}

// Tipe yg bisa dipilih driver sendiri lewat tombol tambah (+) di menu Aktivitas -- "Pengecekan"
// SENGAJA tidak ikut di sini krn sekarang itu wajib dilakukan di awal (gerbang sebelum "Mulai
// Hari Ini" di Home), bukan lagi aktivitas bebas kapan saja. Riwayat Pengecekan yg sudah ada
// tetap kebaca normal lewat ACTIVITY_TYPES/activityTypeMeta di atas (dipakai jg utk filter chip
// riwayat), cuma nggak muncul lagi di pilihan "Tipe Aktivitas" saat bikin baru.
export const ADDABLE_ACTIVITY_TYPES = ACTIVITY_TYPES.filter((a) => a.id !== "pengecekan");

// Alasan gagal — belum ada field khusus di ERPNext (Delivery Request tidak punya field
// failure_reason terpisah, cuma field "issues" bebas teks). Dipertahankan sebagai pilihan
// terstruktur di sisi mobile; nanti bisa digabung ke field "issues" saat API tersambung.
export const FAILURE_REASONS = [
  { id: "tidak_ada_di_tempat", label: "Tidak Ada di Tempat" },
  { id: "alamat_tidak_ditemukan", label: "Alamat Tidak Ditemukan" },
  { id: "customer_menolak", label: "Customer Menolak" },
  { id: "lainnya", label: "Lainnya" },
];

export function failureReasonLabel(id) {
  const r = FAILURE_REASONS.find((f) => f.id === id);
  return r ? r.label : "Lainnya";
}

// Status per pengiriman — disamakan PERSIS dengan field asli ERPNext
// (Delivery Request.delivery_status, opsi: Pending | Ditugaskan | Dalam Perjalanan | Terkirim | Gagal).
// Catatan: ERP tidak punya status "pickup/diambil dari outlet" terpisah — begitu masuk ke
// kurir, pengiriman langsung berstatus "Ditugaskan" sampai kurir berangkat.
export function statusLabel(status) {
  switch (status) {
    case "ditugaskan":
      return "Ditugaskan";
    case "dalam_perjalanan":
      return "Dikirim";
    case "terkirim":
      return "Selesai";
    case "gagal":
      return "Gagal";
    default:
      return "Menunggu";
  }
}
export function statusKey(status) {
  switch (status) {
    case "ditugaskan":
      return "orange";
    case "dalam_perjalanan":
      return "indigo";
    case "terkirim":
      return "green";
    case "gagal":
      return "red";
    default:
      return "orange";
  }
}
export function statusIconSpec(status) {
  switch (status) {
    case "ditugaskan":
      return { lib: "Ionicons", name: "cube-outline" };
    case "dalam_perjalanan":
      return { lib: "Ionicons", name: "paper-plane-outline" };
    case "terkirim":
      return { lib: "Ionicons", name: "checkmark-circle-outline" };
    case "gagal":
      return { lib: "Ionicons", name: "close-circle-outline" };
    default:
      return { lib: "Ionicons", name: "time-outline" };
  }
}
