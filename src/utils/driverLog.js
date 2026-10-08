// Statistik ringkas pengiriman + pengeluaran (dipakai DriverLogScreen) -- TIDAK lagi menghitung
// KM/durasi di sini, karena sejak alur baru (Mulai/Transit/Selesai = log kejadian per-aksi,
// bukan 1 objek trip per hari) data KM per-checkpoint ada di `driverLogEntries` (field `km`
// masing-masing entry) dan di tiap pengiriman (`pickupKm`/`kmArrival`) -- ditampilkan langsung
// dari situ di layar, tidak perlu direkap ulang jadi 1 angka di sini.
export function computeDriverLogStats(deliveriesInRange, expensesInRange) {
  const totalDo = deliveriesInRange.length;
  const delivered = deliveriesInRange.filter((d) => d.status === "terkirim").length;
  const failed = deliveriesInRange.filter((d) => d.status === "gagal").length;
  const successRate = totalDo > 0 ? Math.round((delivered / totalDo) * 1000) / 10 : 0;
  const totalTransfer = deliveriesInRange.filter((d) => d.paymentMethod === "Transfer").length;

  const sumBy = (kategori) => expensesInRange.filter((e) => e.kategori === kategori).reduce((s, e) => s + (e.nominal || 0), 0);
  const bbmExpense = sumBy("bbm");
  const tollExpense = sumBy("toll");
  const parkirExpense = sumBy("parkir");
  const totalExpenseAll = expensesInRange.reduce((s, e) => s + (e.nominal || 0), 0);
  const otherExpense = Math.max(0, totalExpenseAll - bbmExpense - tollExpense - parkirExpense);

  const vehicleLink = deliveriesInRange.find((d) => d.vehiclePlat)?.vehiclePlat || null;
  const outletLink = deliveriesInRange.find((d) => d.outlet)?.outlet || null;
  const deliveryOrders = deliveriesInRange.map((d) => d.noResi).filter(Boolean).join(", ");
  const dayCount = new Set(deliveriesInRange.map((d) => d.date)).size;

  return {
    totalDo,
    totalStops: totalDo,
    delivered,
    failed,
    successRate,
    totalTransfer,
    totalExpense: totalExpenseAll,
    bbmExpense,
    tollExpense,
    parkirExpense,
    otherExpense,
    vehicle: vehicleLink,
    outlet: outletLink,
    deliveryOrders,
    dayCount,
  };
}
