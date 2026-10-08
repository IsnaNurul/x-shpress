import { erpFileUrl } from "./erpClient";

const STATUS_FROM_ERP = {
  Pending: "pending",
  Ditugaskan: "ditugaskan",
  "Dalam Perjalanan": "dalam_perjalanan",
  Terkirim: "terkirim",
  Gagal: "gagal",
};

const STATUS_TO_ERP = Object.fromEntries(Object.entries(STATUS_FROM_ERP).map(([k, v]) => [v, k]));

export function statusToErp(status) {
  return STATUS_TO_ERP[status] || "Pending";
}

function toMillis(dt) {
  if (!dt) return null;
  const iso = dt.includes("T") ? dt : dt.replace(" ", "T");
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// Kebalikan toMillis() -- dipakai utk kirim Datetime field balik ke ERP (format Frappe: "YYYY-MM-DD HH:MM:SS").
export function toErpDatetime(ms) {
  if (!ms) return null;
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Mapping doc "Delivery Request" (ERPNext) -> bentuk data pengiriman yang dipakai mobile.
// Field departed_at/delivered_at/failed_at/km_arrival/proof_of_delivery/failure_reason BELUM
// ada di ERP (belum ditambahkan admin) -> akan selalu null dari ERP, mobile tetap simpan
// progres ini secara lokal sampai field-nya tersedia.
export function mapErpToDelivery(doc) {
  const dateIso = (doc.creation || "").slice(0, 10);
  return {
    id: doc.name,
    date: dateIso,
    penerima: doc.customer_name || "-",
    contactNumber: doc.phone || null,
    alamat: doc.address_street || "-",
    landmark: doc.address_landmark || null,
    outlet: doc.outlet || null,
    vehicleType: doc.vehicle_type || null, // MOTOR | MOBIL -> dari ERP, dipakai utk saran kendaraan
    vehiclePlat: doc.vehicle || null, // Link ke doctype Vehicle (Custom Field) -> name-nya = plat nomor, diisi dispatcher/admin
    pickupKm: doc.pickup_km || null, // KM checkpoint "Transit/Ambil Barang di Outlet" -> field ERP sungguhan
    catatan: doc.notes || "",
    status: STATUS_FROM_ERP[doc.delivery_status] || "pending",
    assignedAt: toMillis(doc.creation),
    noResi: doc.name,
    customerCategory: doc.customer_category || null,
    paymentMethod: doc.payment_method || null,
    totalHarga: doc.total_price || null,
    itemName: doc.product_purchased || null,
    qty: doc.product_qty || null,
    productPhoto: erpFileUrl(doc.product_photo),
    rtRw: doc.rt_rw || null,
    desa: doc.village || null,
    district: doc.district || null,
    distanceNormal: doc.distance_normal || null,
    distanceExtra: doc.distance_extra || null,
    itemLocationNote: doc.item_location_note || null,
    departedAt: toMillis(doc.departed_at),
    kmArrival: doc.end_km || null, // KM checkpoint "Selesai"/"Gagal" -> field ERP sungguhan (end_km)
    proofPhoto: erpFileUrl(doc.proof_of_delivery),
    deliveredAt: toMillis(doc.delivered_at),
    failureReason: doc.failure_reason || null,
    failedAt: toMillis(doc.failed_at),
  };
}
