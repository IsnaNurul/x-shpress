export function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

export function pad3(n) {
  n = String(n);
  return n.length >= 3 ? n : ("000" + n).slice(-3);
}

export function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function formatRupiah(n) {
  n = Number(n) || 0;
  return "Rp " + n.toLocaleString("id-ID");
}

export function formatDateLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function formatDateShort(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export function formatTimestamp(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return (
    d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
  );
}

export function formatTimeWIB(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
}

export function greetingWord() {
  const h = new Date().getHours();
  if (h < 11) return "pagi";
  if (h < 15) return "siang";
  if (h < 18) return "sore";
  return "malam";
}

export function initialsOf(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "K";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function makeResiCode(dateIso, seq) {
  return "XSH" + dateIso.replace(/-/g, "") + pad3(seq);
}

export function shiftDateISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function dateToISO(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function formatDateDayMonth(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

// Label ringkas utk pill filter periode -- "Hari Ini" / "6 Okt 2026" / "6 Okt - 9 Okt 2026" / "Semua Tanggal".
export function formatDateRangeLabel(start, end) {
  if (!start) return "Semua Tanggal";
  if (!end || start === end) return start === todayISO() ? "Hari Ini" : formatDateShort(start);
  return `${formatDateDayMonth(start)} - ${formatDateShort(end)}`;
}

// Label buat pilihan pengiriman di form (Transit/Selesai/Kendala) -- nama penerima + barang yg
// diterima (kalau ada), BUKAN kode/ID pengiriman (noResi) yg bikin bingung krn bukan info yg
// kurir kenal di lapangan.
export function deliveryPickLabel(d) {
  const item = d.itemName ? `${d.itemName}${d.qty ? ` x${d.qty}` : ""}` : null;
  return [d.penerima, item].filter(Boolean).join(" · ") || "-";
}

// Baris kecil di bawah deliveryPickLabel -- alamat (biar kurir bisa kenali lokasinya), diikuti
// ID pengiriman (tetap ada, tapi nggak ditonjolkan).
export function deliveryPickSublabel(d) {
  return [d.alamat && d.alamat !== "-" ? d.alamat : null, d.noResi].filter(Boolean).join(" · ");
}
