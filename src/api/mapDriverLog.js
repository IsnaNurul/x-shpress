import { erpFileUrl } from "./erpClient";

function toMillis(dt) {
  if (!dt) return null;
  const iso = dt.includes("T") ? dt : dt.replace(" ", "T");
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// Mapping doc "Driver Log" (ERP) -> bentuk entri lokal "Riwayat Aksi" di Log Driver. Dipakai utk
// memulihkan histori Mulai/Transit/Selesai yg sudah tersimpan di ERP tapi copy lokalnya hilang
// (abis Hapus Data Lokal, ganti HP, dll). ERP cuma punya 3 opsi status (Mulai/Transit/Selesai),
// jadi "selesai_hari" (Akhiri Hari) dibedakan dari "selesai" lewat teks notes-nya yg selalu
// MENGANDUNG "Selesaikan Hari Ini" (lihat finishDay() di AppContext.js) -- pakai includes(), bukan
// exact match, krn notes-nya juga bisa kebawa catatan tambahan opsional di belakangnya.
export function mapErpToDriverLogEntry(doc) {
  let tipe = "selesai";
  if (doc.status === "Mulai") tipe = "mulai";
  else if (doc.status === "Transit") tipe = "transit";
  else if (doc.notes && doc.notes.includes("Selesaikan Hari Ini")) tipe = "selesai_hari";

  return {
    id: doc.name,
    erpName: doc.name,
    date: doc.log_date || (doc.creation || "").slice(0, 10),
    tipe,
    km: doc.km ?? null,
    outlet: doc.outlet || null,
    photo: erpFileUrl(doc.custom_foto),
    deliveryIds: doc.id_pengiriman ? doc.id_pengiriman.split(",").map((s) => s.trim()).filter(Boolean) : [],
    kendaraan: doc.vehicle || null,
    catatan: doc.notes || "",
    jenisPengiriman: doc.jenis_pengiriman || null,
    latitude: doc.latitude || null,
    longitude: doc.longitude || null,
    alamatLokasi: doc.alamat_lokasi || null,
    createdAt: toMillis(doc.creation),
    fromErp: true,
  };
}
