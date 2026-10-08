import { erpFileUrl } from "./erpClient";
import { ACTIVITY_TYPES } from "../data/constants";

const TIPE_FROM_ERP = Object.fromEntries(ACTIVITY_TYPES.map((t) => [t.erpTipe, t.id]));

function toMillis(dt) {
  if (!dt) return null;
  const iso = dt.includes("T") ? dt : dt.replace(" ", "T");
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// Mapping doc "Driver Activity" (ERP) -> bentuk tampilan aktivitas di mobile. Dipakai utk
// "memulihkan" aktivitas yg sudah tersimpan di ERP tapi copy lokalnya di HP hilang (mis. abis
// Kosongkan Data Lokal versi lama, ganti HP, app di-reinstall, dll). Bentuknya flat (bukan shape
// detail lokal spt kategori/jenisKendala) karena ERP cuma nyimpen "deskripsi" teks gabungan.
export function mapErpToActivity(doc) {
  return {
    id: doc.name,
    erpName: doc.name,
    date: (doc.creation || "").slice(0, 10),
    createdAt: toMillis(doc.creation),
    _tipe: TIPE_FROM_ERP[doc.tipe] || "pengeluaran",
    deskripsi: doc.deskripsi || "",
    nominal: doc.nominal || 0,
    foto: erpFileUrl(doc.foto),
    fromErp: true, // nggak bisa diedit/dihapus dari mobile -- cuma hasil baca dari ERP
  };
}
