import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { showStatusPopup } from "../components/StatusPopup";
import { showConfirmPopup } from "../components/ConfirmPopup";
import { STORAGE_KEYS, loadJSON, saveJSON, defaultProfile } from "../data/storage";
import { todayISO, uid } from "../utils/format";
import {
  erpGetList,
  erpUpdateDoc,
  erpCreateDoc,
  erpDeleteDoc,
  erpUploadFile,
  erpLogin,
  erpGenerateApiKeys,
  erpGetOwnApiKey,
  erpSaveFcmToken,
  setErpCredentials,
  clearErpCredentials,
  setOnAuthError,
  ERPNextError,
} from "../api/erpClient";
import { mapErpToDelivery, statusToErp } from "../api/mapDelivery";
import { mapErpToActivity } from "../api/mapActivity";
import { mapErpToDriverLogEntry } from "../api/mapDriverLog";
import { categoryMeta, kendalaTypeLabel } from "../data/constants";
import {
  registerForPushNotificationsAsync,
  addPushTokenListener,
  setupNotificationTapHandler,
} from "../utils/pushNotifications";
import { enqueueSyncJob, processSyncQueue, isRetriableSyncError, getQueueSnapshot } from "../utils/syncQueue";
import { subscribeNetworkStatus } from "../utils/network";

const AppContext = createContext(null);

// Nama tampilan belum bisa diambil dari ERP (Employee doctype tidak bisa dibaca key ini),
// jadi dibuat dari bagian depan email login sbg fallback yg lebih masuk akal drpd email mentah.
function nameFromEmail(email) {
  const local = (email || "").split("@")[0];
  if (!local) return email || "";
  return local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Outlet yg nggak dicentang "Tampilkan di website" di ERP (jadi normalnya kesembunyi dari
// mobile) tapi TETAP perlu kepilih driver sbg titik ambil barang. "DC" blm ada di master data
// ERP sama sekali pas ini ditulis -- kalau nanti dibikin, tambahin kode-nya di sini juga.
const HO_OUTLET_KODES = ["HO FASHION", "HO FMCG"];

const DELIVERY_FIELDS = [
  "name", "creation", "modified", "outlet", "delivery_status", "driver", "vehicle_type", "vehicle",
  "pickup_km", "end_km", "custom_consumer_apps",
  "customer_name", "customer_category", "phone", "payment_method", "total_price",
  "address_street", "address_landmark", "rt_rw", "village", "district",
  "distance_normal", "distance_extra", "item_location_note",
  "product_purchased", "product_qty", "product_photo", "notes", "issues",
];

// Field progres kurir yg belum ada padanannya di ERP (timestamp & foto checkpoint, alasan
// gagal) — kalau ada data lokal utk field ini, JANGAN ditimpa kosong oleh hasil fetch ERP
// terbaru. KM per-checkpoint (pickupKm/kmArrival) TIDAK lagi di sini karena sekarang sudah ada
// field aslinya di ERP (pickup_km/end_km) -- biar fresh fetch ERP yg menang.
const LOCAL_ONLY_DELIVERY_FIELDS = [
  "pickupAt", "pickupPhoto",
  "departedAt", "proofPhoto", "deliveredAt", "failureReason", "failedAt",
];

function mergeWithLocalProgress(freshDelivery, existingById) {
  const existing = existingById.get(freshDelivery.id);
  if (!existing) return freshDelivery;
  const merged = { ...freshDelivery };
  for (const key of LOCAL_ONLY_DELIVERY_FIELDS) {
    if (merged[key] === null || merged[key] === undefined) merged[key] = existing[key] ?? null;
  }
  return merged;
}

// Toast (bukan Alert bawaan sistem -- tampilannya dikustom di App.js) buat kasih tau hasil
// akhir tiap aksi yg nyinkron ke ERP. Cuma 2 hasil: berhasil (semuanya sukses) atau gagal (apa pun
// yg gagal di tengah jalan -- lihat catatan "all-or-nothing" di addDriverLogEntry/syncDriverActivity).
function toastSynced() {
  showStatusPopup({ type: "success", title: "Berhasil", message: "Data berhasil disimpan." });
}
function toastSyncFailed() {
  showStatusPopup({ type: "error", title: "Gagal", message: "Data gagal disimpan, coba lagi." });
}
// Dipakai pas gagal kekirim ke ERP krn SINYAL (bukan ditolak server) -- datanya udah aman
// tersimpan di HP & bakal otomatis kekirim sendiri begitu online lagi, jadi BUKAN error.
function toastQueued() {
  showStatusPopup({
    type: "warning",
    title: "Tersimpan",
    message: "Data akan otomatis dikirim ke server saat koneksi internet tersedia.",
  });
}

// True kalau error-nya krn minta field yg BELUM ada di schema ERP (Custom Field kendaraan/
// kategori/km/jenis_kendala di doctype Driver Activity belum di-migrate di server -- lihat repo
// erpcustomreports). Frappe nolak KERAS query yg nyebut field nggak dikenal (DataError), beda dari
// field yg ada tapi kosong. Dipakai buat fallback query ulang tanpa field2 baru itu biar app tetap
// jalan normal sementara nunggu migrasi di server kelar.
function isUnknownFieldError(err) {
  return err instanceof ERPNextError && /field not permitted in query/i.test(err.message || "");
}

// Field titik lokasi tujuan (alamat customer) di Delivery Request -- diisi admin/dispatcher lewat
// pin di peta pas bikin pesanan (field "Titik Pengiriman"), dipakai utk tombol "Buka di Maps" biar
// kurir langsung diarahkan Google Maps ke titik yg sama persis. Fetch dibungkus fallback kayak
// field2 lain -- kalau ternyata belum ke-migrate/field-nya nggak ada, app tetap jalan normal, cuma
// tombol Maps-nya nggak muncul dulu.
const DELIVERY_LOCATION_FIELDS = ["delivery_latitude", "delivery_longitude"];
async function fetchDeliveryRequests({ filters, limit, orderBy }) {
  try {
    return await erpGetList("Delivery Request", {
      fields: [...DELIVERY_FIELDS, ...DELIVERY_LOCATION_FIELDS],
      filters,
      limit,
      orderBy,
    });
  } catch (err) {
    if (!isUnknownFieldError(err)) throw err;
    return erpGetList("Delivery Request", { fields: DELIVERY_FIELDS, filters, limit, orderBy });
  }
}

export function AppProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [erpUser, setErpUser] = useState(null); // email akun ERP yg sedang login -- dipakai utk fetch balik Driver Activity milik sendiri
  // Status koneksi internet HP (lihat utils/network.js) & jumlah aksi yg masih nunggu di antrian
  // offline (lihat utils/syncQueue.js) -- dipakai utk banner status di App.js, BUKAN dipakai utk
  // nentuin boleh/nggak boleh suatu aksi jalan (aksinya tetap selalu dicoba dulu apa adanya).
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  // Id Delivery Request yg masih punya tugas "delivery_status_update" nyangkut di antrian --
  // dipakai utk badge "Menunggu dikirim" per-baris di layar Pengiriman/Home (beda dari Aktivitas/
  // Driver Log yg udah ketauan dari field `erpName`-nya sendiri).
  const [pendingDeliveryIds, setPendingDeliveryIds] = useState(() => new Set());
  const [date, setDate] = useState(todayISO());
  const [profile, setProfile] = useState(defaultProfile());
  const [deliveries, setDeliveries] = useState([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveriesError, setDeliveriesError] = useState(null);
  // Pesanan dari app Customer yg BELUM ditugaskan ke driver manapun (status "Pending", field
  // `driver` masih kosong) -- beda dari `deliveries` yg selalu ter-filter ke driver yg lagi login.
  // Ini SENGAJA nggak di-filter per-driver, biar driver mana aja bisa lihat & ambil sendiri.
  const [availableDeliveries, setAvailableDeliveries] = useState([]);
  const [availableDeliveriesLoading, setAvailableDeliveriesLoading] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [kendala, setKendala] = useState([]);
  const [pengecekan, setPengecekan] = useState([]);
  const [cuciKendaraan, setCuciKendaraan] = useState([]);
  const [driverLogEntries, setDriverLogEntries] = useState([]);
  // Hitung berapa aksi create (Driver Activity/Driver Log) yg lagi jalan (belum kelar sync-nya).
  // refreshActivities()/refreshDriverLog() skip dulu kalau ini > 0 -- biar nggak ada race antara
  // "entry lokal baru ditambah tapi erpName-nya belum keset" vs "restore-from-ERP nemu dokumen yg
  // SAMA tapi dikira belum ada lokal" -- itu yg sebelumnya bikin 1 aksi (mis. Pengecekan) kecatat
  // dobel di list kalau user buru2 pindah tab sebelum sync-nya kelar.
  const activitySyncCountRef = useRef(0);
  const driverLogSyncCountRef = useRef(0);
  const [vehicles, setVehicles] = useState([]);
  // Kendaraan hasil Pengecekan hari ini -- SUMBER UTAMANYA ERP langsung (bukan array lokal
  // `pengecekan`), supaya validasi di mana2 (gerbang Mulai, field Kendaraan di Aktivitas) nggak
  // ketinggalan/salah kalau data lokal sempat nggak sinkron (HP di-reset, race antar refresh,
  // app di-uninstall-install ulang, dll). Diisi optimis begitu driver submit Pengecekan sendiri
  // (addPengecekan), DAN dicek ulang langsung ke ERP lewat refreshTodaysKendaraan().
  const [todaysKendaraan, setTodaysKendaraan] = useState(null);
  const [todaysKendaraanLoading, setTodaysKendaraanLoading] = useState(false);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [outlets, setOutlets] = useState([]);
  const [outletsLoading, setOutletsLoading] = useState(false);
  const [openSheetCount, setOpenSheetCount] = useState(0);

  const pushSheet = useCallback(() => setOpenSheetCount((c) => c + 1), []);
  const popSheet = useCallback(() => setOpenSheetCount((c) => Math.max(0, c - 1)), []);

  useEffect(() => {
    (async () => {
      try {
        const [p, cachedDeliveries, e, k, pc, cw, dl, loggedIn, erpAuth] = await Promise.all([
          loadJSON(STORAGE_KEYS.profile, defaultProfile()),
          loadJSON(STORAGE_KEYS.deliveries, []), // cache lokal, akan ditimpa data live ERP
          loadJSON(STORAGE_KEYS.expenses, []),
          loadJSON(STORAGE_KEYS.kendala, []),
          loadJSON(STORAGE_KEYS.pengecekan, []),
          loadJSON(STORAGE_KEYS.cuciKendaraan, []),
          loadJSON(STORAGE_KEYS.driverLogEntries, []),
          loadJSON(STORAGE_KEYS.auth, false),
          loadJSON(STORAGE_KEYS.erpAuth, null),
        ]);
        setProfile(p);
        setDeliveries(cachedDeliveries);
        setExpenses(e);
        setKendala(k);
        setPengecekan(pc);
        setCuciKendaraan(cw);
        setDriverLogEntries(dl);
        // Pulihkan token API milik akun ERP yg sedang login (sebelum effect refresh jalan).
        if (erpAuth && erpAuth.apiKey && erpAuth.apiSecret) {
          setErpCredentials(erpAuth.apiKey, erpAuth.apiSecret);
          setErpUser(erpAuth.usr || null);
        }
        setIsLoggedIn(!!loggedIn);
      } catch (err) {
        console.error("Gagal memuat data awal aplikasi:", err);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateProfile = useCallback(async (patch) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      saveJSON(STORAGE_KEYS.profile, next);
      return next;
    });
  }, []);

  const refreshDeliveries = useCallback(
    async (driverIdOverride) => {
      const driverId = driverIdOverride || profile.idKurir;
      if (!driverId) return;
      setDeliveriesLoading(true);
      setDeliveriesError(null);
      try {
        const rows = await fetchDeliveryRequests({
          // "Tugas Saya" = field `driver` = Employee kurir yg lagi login (sumber kebenaran siapa
          // yg pegang pesanan -- BUKAN `_assign`/Assign To), dan delivery_status bukan "Pending"
          // (belum di-assign). Status "Ditugaskan" IKUT ditarik di sini (beda dari sebelumnya),
          // tapi abis itu di-saring lagi di bawah -- "Ditugaskan" cuma masuk "Tugas Saya" kalau
          // BUKAN pesanan dari app customer (consumerApps false, brarti dispatcher yg assign
          // manual = udah dikonfirmasi orang). Kalau consumerApps true, dia harus mampir dulu ke
          // "Pesanan Tersedia" nunggu driver tap "Kirim Pesanan" (lihat refreshAvailableDeliveries).
          filters: [
            ["driver", "=", driverId],
            ["delivery_status", "!=", "Pending"],
          ],
          limit: 200,
          orderBy: "creation desc",
        });
        const filtered = rows.filter((row) => !(row.delivery_status === "Ditugaskan" && row.custom_consumer_apps));
        setDeliveries((prev) => {
          const existingById = new Map(prev.map((d) => [d.id, d]));
          const mapped = filtered.map((row) => mergeWithLocalProgress(mapErpToDelivery(row), existingById));
          saveJSON(STORAGE_KEYS.deliveries, mapped);
          return mapped;
        });
      } catch (err) {
        console.error("Gagal memuat data pengiriman dari ERP:", err);
        // Error krn nggak ada sinyal (BUKAN ERPNextError) UDAH kewakilin sama banner offline
        // global (SyncStatusBanner, lihat App.js) -- jangan tampilin pesan generik yg dobel di
        // sini lagi. Cuma ERPNextError ASLI (request-nya nyampe server tapi DITOLAK, mis. akun
        // belum ditautkan ke Employee) yg emang butuh pesan khusus di layar ini.
        if (err instanceof ERPNextError) setDeliveriesError(err.message);
      } finally {
        setDeliveriesLoading(false);
      }
    },
    [profile.idKurir]
  );

  // Tarik pesanan yg UDAH di-assign ke driver yg lagi login, statusnya masih "Ditugaskan" (belum
  // dikirim/dijalanin), DAN asalnya dari app customer (custom_consumer_apps) -- daftar buat
  // sub-tab "Pesanan Tersedia" di layar Pengiriman. Pesanan "Ditugaskan" yg BUKAN dari app
  // customer (dispatcher assign manual di ERP) sengaja TIDAK masuk sini -- itu langsung ke "Tugas
  // Saya" (lihat refreshDeliveries), krn assignment manual dispatcher udah dianggap konfirmasi,
  // nggak perlu approval tambahan "Kirim Pesanan" dari driver.
  const refreshAvailableDeliveries = useCallback(async () => {
    if (!profile.idKurir) return;
    setAvailableDeliveriesLoading(true);
    try {
      const rows = await fetchDeliveryRequests({
        filters: [
          ["driver", "=", profile.idKurir],
          ["delivery_status", "=", "Ditugaskan"],
        ],
        limit: 200,
        orderBy: "creation desc",
      });
      setAvailableDeliveries(rows.filter((row) => row.custom_consumer_apps).map(mapErpToDelivery));
    } catch (err) {
      console.error("Gagal memuat pesanan tersedia dari ERP:", err);
    } finally {
      setAvailableDeliveriesLoading(false);
    }
  }, [profile.idKurir]);

  // Driver tap "Kirim Pesanan" dari "Pesanan Tersedia" -- sekali tap langsung ubah status jadi
  // "Dalam Perjalanan", TANPA form KM/foto/kendaraan (beda dari Transit di Home yg emang butuh
  // itu semua krn ngumpulin banyak pengiriman sekaligus per-outlet). Begitu status berubah,
  // pesanan ini otomatis pindah keluar dari "Pesanan Tersedia" & masuk ke "Tugas Saya" lewat
  // refresh ulang -- bukan dihapus manual dari state di sini, biar sumber kebenarannya tetap ERP.
  const sendDelivery = useCallback(
    async (id) => {
      if (!erpUser) {
        return { success: false, message: "Sesi tidak valid, coba login ulang." };
      }
      try {
        await erpUpdateDoc("Delivery Request", id, { delivery_status: "Dalam Perjalanan" });
        setAvailableDeliveries((prev) => prev.filter((d) => d.id !== id));
        refreshDeliveries();
        return { success: true };
      } catch (err) {
        console.error("Gagal kirim pesanan:", err);
        return { success: false, message: "Gagal mengirim pesanan, coba lagi." };
      }
    },
    [erpUser, refreshDeliveries]
  );

  useEffect(() => {
    if (!loading && isLoggedIn && profile.idKurir) {
      refreshDeliveries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isLoggedIn]);

  // Pantau status internet HP secara real-time (dipasang SEKALI aja, nggak ikut erpUser -- tetap
  // relevan ditampilkan sebelum login, mis. pas mau login tapi offline).
  useEffect(() => {
    const unsubscribe = subscribeNetworkStatus(setIsOnline);
    return unsubscribe;
  }, []);

  // Terapkan isi antrian terbaru (dari enqueueSyncJob atau processSyncQueue) ke 2 state di atas
  // -- jumlah total (buat banner) & Set id pengiriman yg masih nunggu (buat badge per-baris).
  const applyQueueSnapshot = useCallback((queue) => {
    setPendingSyncCount(queue.length);
    setPendingDeliveryIds(new Set(queue.filter((j) => j.kind === "delivery_status_update").map((j) => j.payload.id)));
  }, []);

  // Antrian offline yg nyisa dari sesi sebelumnya (mis. app ditutup sebelum sempat online lagi)
  // -- dimuat sekali di awal, selanjutnya diupdate manual tiap kali antrian berubah (lihat
  // refreshPendingSyncCount di bawah).
  useEffect(() => {
    getQueueSnapshot().then(applyQueueSnapshot);
  }, [applyQueueSnapshot]);

  const refreshPendingSyncCount = useCallback(() => {
    getQueueSnapshot().then(applyQueueSnapshot);
  }, [applyQueueSnapshot]);

  // Token FCM device jarang tapi bisa berubah sendiri di tengah sesi (mis. di-refresh sistem).
  // Dengerin perubahan itu selama masih login, biar token yg kesimpen di ERP selalu yg terbaru.
  useEffect(() => {
    if (!erpUser) return undefined;
    const unsubscribe = addPushTokenListener((token) => {
      erpSaveFcmToken(token).catch((err) => console.error("Gagal update push token ke ERP:", err));
    });
    return unsubscribe;
  }, [erpUser]);

  // Buka tab "Pengiriman" pas push notification "Tugas Pengiriman Baru" di-tap -- dipasang
  // SEKALI aja pas app pertama mulai (bukan ikut erpUser kayak listener di atas), krn ini cuma
  // ngurusin navigasi, nggak butuh identitas akun. Lihat setupNotificationTapHandler buat detail
  // skenario cold-start vs app yg udah jalan.
  useEffect(() => {
    const unsubscribe = setupNotificationTapHandler();
    return unsubscribe;
  }, []);

  // Daftar kendaraan (doctype ERP "Vehicle") dipakai utk field "Kendaraan" di semua tipe
  // Aktivitas -- cuma dibaca, tidak pernah ditulis dari mobile. Difilter yg statusnya Aktif saja.
  const refreshVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    try {
      const rows = await erpGetList("Vehicle", {
        fields: ["name", "plate_number", "vehicle_type", "brand", "status"],
        filters: [["status", "=", "Aktif"]],
        limit: 200,
        orderBy: "plate_number asc",
      });
      setVehicles(rows);
    } catch (err) {
      console.error("Gagal memuat data kendaraan dari ERP:", err);
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  // Lookup plat nomor -> label lengkap (plat + jenis + merek), dipakai di mana pun kendaraan
  // ditampilkan (riwayat Aktivitas dll) -- yg disimpan/dicocokkan tetap plat nomor (itu yg
  // dipilih driver & itu yg disimpan ke ERP), yg kelihatan ke kurir label lengkapnya.
  const vehicleLabel = useCallback(
    (plate) => {
      if (!plate) return null;
      const found = vehicles.find((v) => v.plate_number === plate);
      if (!found) return plate;
      return [found.plate_number, found.vehicle_type, found.brand].filter(Boolean).join(" · ");
    },
    [vehicles]
  );

  useEffect(() => {
    if (!loading && isLoggedIn) {
      refreshVehicles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isLoggedIn]);

  // Daftar outlet (doctype ERP "Outlet") dipakai utk field "Outlet Asal" di Mulai & Transit --
  // SELALU seluruh master data outlet yg aktif, BUKAN cuma outlet yg kebetulan ada di pengiriman
  // hari ini (biar tetap kepilih walau belum ada/udah kehapus data pengiriman hari itu). Field
  // `name`/`kode` itu KODE internal (dipakai sbg value krn itu yg disimpan di Delivery
  // Request.outlet & Driver Log.outlet), `nama` itu nama outlet yg sebenarnya buat ditampilkan.
  const refreshOutlets = useCallback(async () => {
    setOutletsLoading(true);
    try {
      const rows = await erpGetList("Outlet", {
        fields: ["name", "kode", "nama", "is_active", "tampilkan_di_website"],
        // Outlet yg boleh muncul sbg pilihan di mobile: yg aktif DAN (dicentang "Tampilkan di
        // website" ATAU masuk daftar pengecualian HO_OUTLET_KODES di bawah -- HO nggak dicentang
        // tampilkan_di_website di ERP krn memang bukan outlet publik, tapi driver tetap perlu bisa
        // pilih HO sbg titik ambil barang). Filter OR-nya disaring di JS, bukan di query Frappe,
        // krn `filters` REST API Frappe defaultnya AND semua.
        filters: [["is_active", "=", 1]],
        limit: 200,
        orderBy: "nama asc",
      });
      const filtered = rows.filter((r) => r.tampilkan_di_website || HO_OUTLET_KODES.includes(r.kode));
      setOutlets(filtered);
    } catch (err) {
      console.error("Gagal memuat data outlet dari ERP:", err);
    } finally {
      setOutletsLoading(false);
    }
  }, []);

  // Lookup kode outlet -> nama outlet, dipakai di mana pun outlet ditampilkan (bukan cuma pas
  // milih) biar konsisten -- yg disimpan/dicocokkan tetap kode, yg kelihatan ke kurir nama-nya.
  const outletName = useCallback(
    (kode) => {
      if (!kode) return null;
      const found = outlets.find((o) => o.kode === kode || o.name === kode);
      return (found && found.nama) || kode;
    },
    [outlets]
  );

  useEffect(() => {
    if (!loading && isLoggedIn) {
      refreshOutlets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isLoggedIn]);

  // Cek LANGSUNG ke ERP (bukan array lokal `pengecekan`) apakah hari ini sudah ada Pengecekan, &
  // kendaraan apa yg dipakai -- ini yg jadi acuan tunggal/sumber kebenaran buat gerbang Mulai &
  // field Kendaraan di Aktivitas. Diambil dgn narik 1 baris Pengecekan terbaru hari ini & baca
  // field `vehicle`-nya langsung (field standar yg sudah ada dari awal di Driver Activity, label
  // "Kendaraan" -- BUKAN Custom Field, jadi nggak perlu nunggu migrasi apa pun).
  // Kalau request ke ERP-nya gagal (mis. nggak ada koneksi), jatuh balik ke array lokal `pengecekan`
  // drpd kosong total, biar tetap bisa jalan offline.
  const refreshTodaysKendaraan = useCallback(async () => {
    if (!erpUser) return;
    setTodaysKendaraanLoading(true);
    try {
      const rows = await erpGetList("Driver Activity", {
        filters: [
          ["owner", "=", erpUser],
          ["tipe", "=", "Pengecekan"],
          ["creation", ">=", `${todayISO()} 00:00:00`],
        ],
        fields: ["vehicle", "creation"],
        limit: 1,
        orderBy: "creation desc",
      });
      if (rows.length === 0) {
        setTodaysKendaraan(null);
        return;
      }
      if (rows[0].vehicle) {
        setTodaysKendaraan(rows[0].vehicle);
        return;
      }
      // Baris Pengecekan hari ini ADA tapi field `vehicle`-nya kosong (mis. entri lama dari
      // sebelum field ini diisi dari mobile). Drpd salah nganggep "belum pengecekan" & buka
      // gerbang WAJIB lagi padahal udah pernah, cek dulu array lokal `pengecekan` hari ini.
      const localMatch = pengecekan.find((p) => p.date === todayISO() && p.kendaraan);
      setTodaysKendaraan(localMatch ? localMatch.kendaraan : null);
    } catch (err) {
      console.error("Gagal cek Pengecekan hari ini dari ERP, jatuh balik ke data lokal:", err);
      setTodaysKendaraan((prev) => {
        const localMatch = pengecekan.find((p) => p.date === todayISO() && p.kendaraan);
        return localMatch ? localMatch.kendaraan : prev;
      });
    } finally {
      setTodaysKendaraanLoading(false);
    }
  }, [erpUser, pengecekan]);

  // Login ASLI pakai email + password akun ERP sungguhan (bukan cuma cek keberadaan ID).
  // Alurnya 100% pakai API bawaan Frappe, TIDAK mengubah apa pun di ERP:
  //   1. /api/method/login -> verifikasi email+password sungguhan ke ERP.
  //   2. generate_keys     -> buat API Key/Secret MILIK AKUN ITU SENDIRI (bukan key bersama lagi).
  //   3. Cari Employee yang user_id-nya = email ini -> itu driver id utk filter Delivery Request.
  // Catatan: data yg KELIHATAN tetap ditentukan oleh izin role akun itu di ERP (mis. role COURIER
  // saat ini belum dikasih izin baca Delivery Request) — itu wewenang admin ERP, bukan sesuatu yg
  // bisa/boleh dilewati dari sisi mobile demi keamanan.
  const login = useCallback(
    async (email, password) => {
      const usr = (email || "").trim();
      const pwd = (password || "").trim();
      if (!usr || !pwd) {
        return { success: false, message: "Email dan password wajib diisi." };
      }
      try {
        await erpLogin(usr, pwd);
      } catch (err) {
        console.error("Login gagal (step 1 - erpLogin):", err);
        // ERPNextError = ERP-nya beneran kebalas (mis. password salah) -- pesannya dari server,
        // lebih akurat drpd nebak. Error lain (mis. fetch gagal total/konfigurasi kosong) jangan
        // disamarkan jadi "salah password", krn itu nyesatin -- tampilkan apa adanya.
        const message =
          err instanceof ERPNextError
            ? err.message || "Email atau password salah."
            : "Tidak bisa terhubung ke server ERP. Cek koneksi internet, atau hubungi admin kalau masalah berlanjut.";
        return { success: false, message };
      }

      let apiKey, apiSecret;
      try {
        const keys = await erpGenerateApiKeys(usr);
        apiSecret = keys && keys.api_secret;
        apiKey = await erpGetOwnApiKey(usr);
        if (!apiKey || !apiSecret) throw new Error("API key/secret kosong setelah generate_keys");
      } catch (err) {
        console.error("Login gagal (step 2 - generate/get API key):", err);
        return { success: false, message: "Login berhasil tapi gagal membuat token akses akun. Hubungi admin." };
      }

      setErpCredentials(apiKey, apiSecret);
      setErpUser(usr);
      await saveJSON(STORAGE_KEYS.erpAuth, { usr, apiKey, apiSecret });

      // Daftar push notification (FCM) fire-and-forget -- jangan sampai gagal daftar notif
      // bikin login gagal. Token-nya disimpen ke Custom Field User.custom_fcm_token lewat
      // whitelisted method (bukan erpUpdateDoc/PUT biasa -- role DRIVER blm tentu punya izin
      // tulis ke doctype User, lihat catatan di erpSaveFcmToken), dipakai server ERP pas ada
      // Delivery Request baru di-assign (lihat custom_reports/api/push_notifications.py).
      registerForPushNotificationsAsync()
        .then((token) => {
          if (!token) return;
          erpSaveFcmToken(token).catch((err) => console.error("Gagal simpan push token ke ERP:", err));
        })
        .catch((err) => console.error("Gagal daftar push notification:", err));

      let driverId = null;
      let employeeName = null;
      let employeePhone = null;
      try {
        const emps = await erpGetList("Employee", {
          filters: [["user_id", "=", usr]],
          fields: ["name", "employee_name", "cell_number"],
          limit: 1,
        });
        driverId = emps.length > 0 ? emps[0].name : null;
        employeeName = emps.length > 0 ? emps[0].employee_name : null;
        employeePhone = emps.length > 0 ? emps[0].cell_number : null;
      } catch (err) {
        driverId = null;
        employeeName = null;
        employeePhone = null;
      }

      // Login = identitas baru -> selalu timpa nama/ID/telepon lama (termasuk sisa data dummy).
      // Semua 3 field ini SELALU dari ERP (Employee), tidak ada lagi jalur edit manual di mobile
      // -- supaya tidak ada data yg keliatan seperti identitas resmi tapi sebenarnya cuma lokal.
      await updateProfile({
        idKurir: driverId || "",
        nama: employeeName || nameFromEmail(usr),
        telepon: employeePhone || "",
      });
      setIsLoggedIn(true);
      await saveJSON(STORAGE_KEYS.auth, true);

      if (driverId) {
        refreshDeliveries(driverId);
      } else {
        setDeliveriesError("Akun ini belum terhubung ke data Employee/driver di ERP. Hubungi admin untuk menautkannya.");
      }
      return { success: true };
    },
    [updateProfile, refreshDeliveries]
  );

  const logout = useCallback(async () => {
    setIsLoggedIn(false);
    setErpUser(null);
    clearErpCredentials();
    // Bersihkan profil & cache pengiriman sepenuhnya saat logout — supaya tidak ada data
    // identitas/kendaraan kurir sebelumnya yang nyangkut buat akun berikutnya yang login.
    const emptyProfile = defaultProfile();
    setProfile(emptyProfile);
    setDeliveries([]);
    await Promise.all([
      saveJSON(STORAGE_KEYS.auth, false),
      saveJSON(STORAGE_KEYS.erpAuth, null),
      saveJSON(STORAGE_KEYS.profile, emptyProfile),
      saveJSON(STORAGE_KEYS.deliveries, []),
    ]);
  }, []);

  // Kalau ERP nolak request krn API key/secret di HP ini sudah tidak valid lagi (mis. Secret-nya
  // ke-reset krn akun yg sama login ulang di device lain), erpClient.js mendeteksi itu & manggil
  // callback ini (lewat setOnAuthError) -- tampilkan popup (wajib ditekan OK dulu, bukan auto-
  // hilang) baru logout & balik ke halaman Login, drpd nyangkut nampilin pesan teknis mentah
  // ("frappe.exceptions.AuthenticationError") ke kurir.
  useEffect(() => {
    setOnAuthError(() => {
      showConfirmPopup({
        title: "Sesi Berakhir",
        message: "Sesi login kamu sudah habis, silakan login ulang.",
        confirmText: "OK",
        hideCancel: true,
        onConfirm: logout,
      });
    });
  }, [logout]);

  const updateDeliveries = useCallback((updater) => {
    setDeliveries((prev) => {
      const next = updater(prev);
      saveJSON(STORAGE_KEYS.deliveries, next);
      return next;
    });
  }, []);

  // Update status/KM 1 Delivery Request ke ERP -- dipakai baik pas aksi Transit/Selesai
  // dilakukan MAUPUN pas retry dari antrian offline, makanya SELALU throw kalau gagal (biar
  // pemanggil/antrian bisa bedain gagal krn sinyal vs ditolak server). Local state-nya sendiri
  // udah diupdate optimis duluan di transitPickup/completeDeliveries (lihat applyDeliveryPatch),
  // jadi di sini nggak ada lagi yg perlu dipatch ke lokal pas berhasil.
  const syncDeliveryStatusToErp = useCallback(async (payload) => {
    await erpUpdateDoc("Delivery Request", payload.id, payload.data);
  }, []);

  // Coba kirim SEKARANG; kalau gagal krn sinyal, masukin ke antrian offline buat dicoba lagi
  // nanti (toast "tersimpan, nanti otomatis terkirim"). Kalau ditolak server (bukan soal
  // sinyal -- mis. validasi/izin), TIDAK diantri, langsung kasih toast gagal krn percuma diulang.
  const attemptDeliveryStatusSync = useCallback(
    (id, data) => {
      syncDeliveryStatusToErp({ id, data }).catch((err) => {
        if (isRetriableSyncError(err)) {
          enqueueSyncJob("delivery_status_update", { id, data }).then(() => {
            refreshPendingSyncCount();
            toastQueued();
          });
          return;
        }
        console.error("Gagal update status pengiriman ke ERP:", err);
        toastSyncFailed();
      });
    },
    [syncDeliveryStatusToErp, refreshPendingSyncCount]
  );

  // Transit/Selesai bisa milih pengiriman yg statusnya masih "Ditugaskan" -- tapi item "Ditugaskan"
  // itu sekarang hidupnya di `availableDeliveries` ("Pesanan Tersedia"), BUKAN di `deliveries`
  // ("Tugas Saya") lagi. Kalau cuma `updateDeliveries(...)` biasa, item yg sumbernya dari
  // `availableDeliveries` nggak ketemu buat di-patch (krn emang nggak ada di situ) -- jadi update-
  // nya silently no-op, dan item itu NYANGKUT keliatan "masih Ditugaskan" terus di Pesanan Tersedia
  // & tetep nongol sebagai pilihan "belum selesai" di sheet berikutnya, padahal ERP-nya udah
  // kebalik status. Helper ini mindahin item yg match ke `deliveries` (dgn patch-nya) & buang dari
  // `availableDeliveries`, sekalian patch item yg emang udah ada di `deliveries`.
  const applyDeliveryPatch = useCallback(
    (ids, patchFn) => {
      const idSet = new Set(ids);
      let moving = [];
      setAvailableDeliveries((prevAvail) => {
        moving = prevAvail.filter((d) => idSet.has(d.id));
        return prevAvail.filter((d) => !idSet.has(d.id));
      });
      updateDeliveries((prevDel) => {
        const existingIds = new Set(prevDel.map((d) => d.id));
        const patched = prevDel.map((d) => (idSet.has(d.id) ? patchFn(d) : d));
        const newcomers = moving.filter((d) => !existingIds.has(d.id)).map(patchFn);
        return [...patched, ...newcomers];
      });
    },
    [updateDeliveries]
  );

  // Driver Log sekarang LOG KEJADIAN (1 baris ERP baru tiap aksi: Mulai/Transit/Selesai),
  // BUKAN lagi rekap harian yg di-upsert. Field ERP yg dipakai: courier, courier_name, log_date,
  // outlet, km (satu angka generik), status (Select Mulai/Transit/Selesai), notes, vehicle,
  // custom_foto (foto lokal HP diupload ke sini begitu baris log-nya sukses dibuat). Field2 rekap
  // lama (total_do, delivered, km_start/end, dst) sengaja TIDAK diisi lagi.
  // `vehicle` TERNYATA field ASLI (standar, bukan Custom Field) di doctype Driver Log -- bukan
  // "nggak ada field kendaraan" spt yg dikira sebelumnya, cuma belum pernah diisi dari mobile.
  // Jadi kendaraan dikirim sbg field terpisah skr, bukan digabung ke teks notes lagi.
  // ALL-OR-NOTHING: baris Driver Log di ERP baru dianggap sah (dan local entry baru ditandai
  // `erpName`) kalau dokumennya SEKALIGUS foto buktinya (kalau ada) sama2 sukses. Kalau fotonya
  // gagal diupload, dokumen yg SUDAH terlanjur dibuat di ERP langsung dihapus lagi (rollback) biar
  // nggak ada baris log cacat/tanpa foto yg nyangkut di ERP.
  // Tandai 1 item di salah satu koleksi lokal (Driver Log/Aktivitas) sbg sudah punya padanan di
  // ERP (`erpName`) -- fungsi tunggal ini dipakai baik pas sync langsung berhasil MAUPUN pas
  // retry dari antrian offline berhasil belakangan, jadi logiknya nggak dobel di 2 tempat.
  const markLocalErpName = useCallback((collection, localId, erpName) => {
    const setters = {
      driverLogEntries: [setDriverLogEntries, STORAGE_KEYS.driverLogEntries],
      expenses: [setExpenses, STORAGE_KEYS.expenses],
      kendala: [setKendala, STORAGE_KEYS.kendala],
      pengecekan: [setPengecekan, STORAGE_KEYS.pengecekan],
      cuciKendaraan: [setCuciKendaraan, STORAGE_KEYS.cuciKendaraan],
    };
    const found = setters[collection];
    if (!found) return;
    const [setState, storageKey] = found;
    setState((prev) => {
      const next = prev.map((item) => (item.id === localId ? { ...item, erpName } : item));
      saveJSON(storageKey, next);
      return next;
    });
  }, []);

  // Jalanin SEKALI create dokumen Driver Log + (kalau ada) upload foto buktinya -- dipakai baik
  // pas aksi baru dilakukan MAUPUN pas retry dari antrian offline (lihat syncQueue.js), makanya
  // fungsi ini SELALU throw kalau gagal (bukan return null) biar pemanggil/antrian bisa tau pasti
  // kapan harus coba lagi nanti (gagal krn sinyal) vs berhenti (ditolak server).
  // ALL-OR-NOTHING: kalau fotonya gagal diupload, dokumen yg SUDAH terlanjur dibuat di ERP
  // langsung dihapus lagi (rollback) biar nggak ada baris log cacat/tanpa foto yg nyangkut di ERP.
  const createDriverLogOnErp = useCallback(
    async (payload) => {
      driverLogSyncCountRef.current += 1;
      try {
        const doc = await erpCreateDoc("Driver Log", payload.docFields);
        if (!doc) throw new ERPNextError("ERP tidak mengembalikan dokumen Driver Log.");
        if (payload.photo) {
          try {
            await erpUploadFile({ doctype: "Driver Log", docname: doc.name, fieldname: "custom_foto", fileUri: payload.photo });
          } catch (err) {
            console.error("Gagal upload foto Driver Log ke ERP, rollback dokumen:", err);
            await erpDeleteDoc("Driver Log", doc.name).catch((delErr) => console.error("Gagal rollback Driver Log:", delErr));
            throw err;
          }
        }
        markLocalErpName("driverLogEntries", payload.localId, doc.name);
      } finally {
        driverLogSyncCountRef.current -= 1;
      }
    },
    [markLocalErpName]
  );

  const addDriverLogEntry = useCallback(
    ({ tipe, km, outlet, photo, deliveryIds, catatan, kendaraan, latitude, longitude, alamatLokasi, jenisPengiriman }) => {
      const localId = uid();
      const effectiveKendaraan = kendaraan || todaysKendaraan;
      // Driver bisa ganti kendaraan di aksi manapun (beda dari yg dipilih pas Pengecekan/aksi
      // sebelumnya) -- begitu dipilih, jadikan itu default buat aksi/Aktivitas berikutnya.
      if (kendaraan && kendaraan !== todaysKendaraan) setTodaysKendaraan(kendaraan);
      const entry = {
        id: localId,
        date: todayISO(),
        tipe, // "mulai" | "transit" | "selesai" | "selesai_hari" (semua non-mulai/transit disync ke ERP sbg "Selesai")
        km: km ?? null,
        outlet: outlet || null,
        photo: photo || null,
        deliveryIds: deliveryIds || [],
        kendaraan: effectiveKendaraan || null,
        catatan: catatan || "",
        jenisPengiriman: jenisPengiriman || null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        alamatLokasi: alamatLokasi || null,
        createdAt: Date.now(),
      };
      setDriverLogEntries((prev) => {
        const next = [...prev, entry];
        saveJSON(STORAGE_KEYS.driverLogEntries, next);
        return next;
      });
      const statusErp = tipe === "mulai" ? "Mulai" : tipe === "transit" ? "Transit" : "Selesai";
      const payload = {
        localId,
        photo: entry.photo,
        docFields: {
          courier: profile.idKurir,
          courier_name: profile.nama,
          log_date: entry.date,
          outlet: entry.outlet,
          km: entry.km,
          status: statusErp,
          notes: entry.catatan,
          vehicle: entry.kendaraan,
          jenis_pengiriman: entry.jenisPengiriman,
          id_pengiriman: entry.deliveryIds.length > 0 ? entry.deliveryIds.join(", ") : null,
          latitude: entry.latitude,
          longitude: entry.longitude,
          alamat_lokasi: entry.alamatLokasi,
        },
      };
      createDriverLogOnErp(payload)
        .then(() => toastSynced())
        .catch((err) => {
          if (isRetriableSyncError(err)) {
            enqueueSyncJob("driver_log_create", payload).then(() => {
              refreshPendingSyncCount();
              toastQueued();
            });
            return;
          }
          console.error("Gagal sync Driver Log ke ERP:", err);
          toastSyncFailed();
        });
    },
    [profile.idKurir, profile.nama, todaysKendaraan, createDriverLogOnErp, refreshPendingSyncCount]
  );

  // Aksi "Mulai" -- 1x di awal hari, KM awal + outlet asal. Tidak terikat ke pengiriman tertentu.
  const startDay = useCallback(
    (km, outlet, photo, kendaraan, location) => {
      addDriverLogEntry({
        tipe: "mulai",
        km,
        outlet,
        photo,
        kendaraan,
        latitude: location?.latitude,
        longitude: location?.longitude,
        alamatLokasi: location?.address,
      });
    },
    [addDriverLogEntry]
  );

  // Aksi "Selesaikan Hari Ini" -- 1x di akhir hari, KM akhir. Pasangan dari "Mulai". ERP cuma
  // punya 3 opsi status (Mulai/Transit/Selesai), jadi ini tetap disync sbg "Selesai" juga --
  // dibedakan di mobile lewat tipe lokal "selesai_hari" (vs "selesai" utk selesaikan pengiriman).
  const finishDay = useCallback(
    (km, photo, deskripsi, kendaraan, location) => {
      addDriverLogEntry({
        tipe: "selesai_hari",
        km,
        photo,
        kendaraan,
        catatan: ["Selesaikan Hari Ini", deskripsi].filter(Boolean).join(" — "),
        latitude: location?.latitude,
        longitude: location?.longitude,
        alamatLokasi: location?.address,
      });
    },
    [addDriverLogEntry]
  );

  // Aksi "Transit" -- ambil barang di 1 outlet. Pilih pengiriman SELALU opsional (bisa kosong,
  // cuma catatan stok/belanja umum nggak terikat 1 pengiriman manapun) & nggak dibatasi harus
  // sumber dari outlet yg lagi dipilih -- 1 pengiriman bisa transit di beberapa outlet berbeda.
  // KM & foto sama utk semua pengiriman yg dipilih. Begitu diambil, status pengiriman LANGSUNG
  // "Dalam Perjalanan" (gak ada lagi langkah "Berangkat" terpisah). `ids` dikirim ke ERP sbg
  // field `id_pengiriman` sendiri (bukan digabung ke teks notes lagi).
  const transitPickup = useCallback(
    (ids, { km, outlet, photo, deskripsi, kendaraan, location }) => {
      applyDeliveryPatch(ids, (d) => ({
        ...d,
        pickupAt: Date.now(),
        pickupKm: km,
        pickupPhoto: photo,
        departedAt: Date.now(),
        status: "dalam_perjalanan",
      }));
      ids.forEach((id) => {
        attemptDeliveryStatusSync(id, { pickup_km: km, delivery_status: statusToErp("dalam_perjalanan") });
      });
      addDriverLogEntry({
        tipe: "transit",
        km,
        outlet,
        photo,
        deliveryIds: ids,
        kendaraan,
        catatan: deskripsi || "",
        latitude: location?.latitude,
        longitude: location?.longitude,
        alamatLokasi: location?.address,
      });
    },
    [applyDeliveryPatch, addDriverLogEntry, attemptDeliveryStatusSync]
  );

  // Aksi "Selesai" -- bisa pilih beberapa pengiriman sekaligus, ditandai Terkirim bareng dgn
  // KM + foto yg sama.
  const completeDeliveries = useCallback(
    (ids, { km, photo, jenis, deskripsi, kendaraan, location }) => {
      applyDeliveryPatch(ids, (d) => ({ ...d, status: "terkirim", kmArrival: km, proofPhoto: photo, deliveredAt: Date.now() }));
      ids.forEach((id) => {
        attemptDeliveryStatusSync(id, { end_km: km, delivery_status: statusToErp("terkirim") });
      });
      addDriverLogEntry({
        tipe: "selesai",
        km,
        photo,
        deliveryIds: ids,
        kendaraan,
        catatan: deskripsi || "",
        jenisPengiriman: jenis,
        latitude: location?.latitude,
        longitude: location?.longitude,
        alamatLokasi: location?.address,
      });
    },
    [applyDeliveryPatch, addDriverLogEntry, attemptDeliveryStatusSync]
  );

  // Tarik ulang histori "Riwayat Aksi" (Mulai/Transit/Selesai) dari ERP -- sama kayak
  // refreshActivities() tapi utk doctype "Driver Log". Dibutuhin krn addDriverLogEntry cuma nulis
  // SEKALI (create saja, nggak pernah dibaca balik), jadi kalau data lokal hilang (abis Hapus Data
  // Lokal, ganti HP, app di-reinstall), histori di layar Log Driver bisa pulih lagi dari ERP alih-
  // alih kosong permanen. Entri lokal yg SUDAH punya erpName dilewati supaya nggak dobel.
  const [driverLogLoading, setDriverLogLoading] = useState(false);
  // Rekonsiliasi 2 arah dgn ERP: entri yg ADA di ERP tapi BELUM ada lokal ditambahkan (pulihkan),
  // DAN entri lokal yg SUDAH pernah tersinkron (punya erpName) tapi erpName-nya udah nggak ada
  // lagi di hasil fetch ERP barusan (berarti dihapus langsung di ERP, di luar app) ikut dibuang
  // dari lokal. Entri yg BELUM punya erpName (baru dibuat, masih nunggu proses sync) dibiarkan --
  // jangan sampai kehapus gara2 race condition pas request create-nya belum selesai.
  const refreshDriverLog = useCallback(async (opts) => {
    if (!profile.idKurir) return;
    // Lagi ada aksi Driver Log yg masih dalam proses nyimpen ke ERP -- skip refresh ini dulu,
    // biar nggak restore dokumen yg SAMA sebagai entry kedua (lihat catatan di driverLogSyncCountRef).
    if (driverLogSyncCountRef.current > 0) return;
    setDriverLogLoading(true);
    try {
      const baseFields = ["name", "log_date", "outlet", "km", "status", "notes", "custom_foto", "creation", "vehicle"];
      const locationFields = ["latitude", "longitude", "alamat_lokasi"];
      const deliveryFields = ["jenis_pengiriman", "id_pengiriman"];
      let rows;
      try {
        rows = await erpGetList("Driver Log", {
          filters: [["courier", "=", profile.idKurir]],
          fields: [...baseFields, ...locationFields, ...deliveryFields],
          limit: 500,
          orderBy: "creation desc",
        });
      } catch (err) {
        if (!isUnknownFieldError(err)) throw err;
        // Salah satu/semua Custom Field lokasi atau jenis_pengiriman/id_pengiriman belum di-migrate
        // di server ERP -- coba lagi tanpa field tambahan, field itu kosong sementara di layar.
        try {
          rows = await erpGetList("Driver Log", {
            filters: [["courier", "=", profile.idKurir]],
            fields: [...baseFields, ...locationFields],
            limit: 500,
            orderBy: "creation desc",
          });
        } catch (err2) {
          if (!isUnknownFieldError(err2)) throw err2;
          rows = await erpGetList("Driver Log", {
            filters: [["courier", "=", profile.idKurir]],
            fields: baseFields,
            limit: 500,
            orderBy: "creation desc",
          });
        }
      }
      const erpNames = new Set(rows.map((r) => r.name));
      const ignoreKnown = !!(opts && opts.ignoreKnown);
      // "known"/"missing" DIHITUNG DI DALAM functional updater (baca `prev` langsung dari React,
      // bukan dari closure render-time) -- biar nggak dobel kalau 2 refreshDriverLog() nimpa
      // bareng (mis. tab Home & Log Driver sama2 refresh pas fokus gonta-ganti tab hampir
      // bersamaan). Closure lama di sini sempat bikin histori kecatat dobel 2x+.
      setDriverLogEntries((prev) => {
        const known = ignoreKnown ? new Set() : new Set(prev.map((e) => e.erpName).filter(Boolean));
        const missing = rows.filter((r) => !known.has(r.name)).map(mapErpToDriverLogEntry);
        const reconciled = prev.filter((e) => !e.erpName || erpNames.has(e.erpName));
        const next = [...reconciled, ...missing];
        saveJSON(STORAGE_KEYS.driverLogEntries, next);
        return next;
      });
    } catch (err) {
      console.error("Gagal fetch Driver Log dari ERP:", err);
    } finally {
      setDriverLogLoading(false);
    }
  }, [profile.idKurir]);

  // CATATAN: tidak ada lagi aksi "Tandai Gagal" manual dari mobile -- kalau pengiriman nggak
  // terkirim di hari itu, ERP sendiri yg otomatis menandainya "Gagal" (delivery_status), jadi
  // mobile nggak perlu nulis status itu. Badge/filter/timeline "Gagal" di mobile tetap jalan
  // normal karena itu cuma MEMBACA status dari ERP, bukan yg nentuin.

  // Semua tipe "Aktivitas" (Kendala/Pengeluaran/Pengecekan/Cuci Kendaraan) dikirim fire-and-forget
  // ke doctype ERP "Driver Activity" begitu dibuat (CREATE saja -- edit/hapus belakangan di mobile
  // TIDAK ikut diupdate/dihapus di ERP, biar simpel). Kalau ada foto (file lokal HP), diupload ke
  // field "foto" (Attach Image) begitu dokumennya sukses dibuat. Return nama doc ERP-nya (atau null
  // kalau gagal) supaya si pemanggil bisa simpan `erpName` itu di item lokalnya -- dipakai nanti
  // oleh refreshActivities() buat tau item lokal mana yg SUDAH punya padanan di ERP, dan item ERP
  // mana yg BELUM ada copy-nya di lokal (berarti perlu dipulihkan, mis. abis local storage ke-reset).
  // ALL-OR-NOTHING sama kayak addDriverLogEntry: kalau upload fotonya gagal, dokumen Driver
  // Activity yg sudah terlanjur dibuat langsung di-rollback (dihapus lagi) biar nggak ada record
  // cacat tanpa foto yg nyangkut di ERP -- pemanggil cuma dapat `null` (dianggap gagal total).
  // kendaraan/kategori/km/jenisKendala sekarang dikirim sbg field asli di ERP (bukan digabung ke
  // teks `deskripsi` lagi) -- biar bisa direkap/difilter langsung dari ERP tanpa parsing teks.
  // `deskripsi` jadi murni catatan bebas dari kurir. Field kendaraan pakai nama `vehicle` (BUKAN
  // `kendaraan`) -- field itu TERNYATA sudah ada dari awal sbg field standar di Driver Activity
  // (label "Kendaraan"), sama persis kasusnya kayak `vehicle` di Driver Log. kategori/km/
  // jenis_kendala tetap Custom Field baru (lihat repo erpcustomreports).
  // Jalanin SEKALI create dokumen Driver Activity + (kalau ada) upload foto buktinya -- dipakai
  // baik pas aksi baru dilakukan MAUPUN pas retry dari antrian offline (lihat syncQueue.js),
  // makanya fungsi ini SELALU throw kalau gagal (bukan return null) biar pemanggil/antrian bisa
  // tau pasti kapan harus coba lagi nanti (gagal krn sinyal) vs berhenti (ditolak server).
  // ALL-OR-NOTHING: kalau fotonya gagal diupload, dokumen yg sudah terlanjur dibuat langsung
  // di-rollback (dihapus lagi) biar nggak ada record cacat tanpa foto yg nyangkut di ERP.
  const createDriverActivityOnErp = useCallback(
    async (payload) => {
      activitySyncCountRef.current += 1;
      try {
        const doc = await erpCreateDoc("Driver Activity", {
          tipe: payload.erpTipe,
          deskripsi: payload.deskripsi || "",
          nominal: payload.nominal || 0,
          vehicle: payload.kendaraan || null,
          kategori: payload.kategori || null,
          km: payload.km || null,
          jenis_kendala: payload.jenisKendala || null,
          latitude: payload.latitude || null,
          longitude: payload.longitude || null,
          alamat_lokasi: payload.alamatLokasi || null,
        });
        if (!doc) throw new ERPNextError("ERP tidak mengembalikan dokumen Driver Activity.");
        if (payload.foto) {
          try {
            await erpUploadFile({ doctype: "Driver Activity", docname: doc.name, fieldname: "foto", fileUri: payload.foto });
          } catch (err) {
            console.error("Gagal upload foto Driver Activity ke ERP, rollback dokumen:", err);
            await erpDeleteDoc("Driver Activity", doc.name).catch((delErr) => console.error("Gagal rollback Driver Activity:", delErr));
            throw err;
          }
        }
        if (payload.localCollection && payload.localId) markLocalErpName(payload.localCollection, payload.localId, doc.name);
      } finally {
        activitySyncCountRef.current -= 1;
      }
    },
    [markLocalErpName]
  );

  // Coba sync SEKARANG; kalau gagal krn sinyal, diantri buat dicoba lagi nanti (toast "tersimpan,
  // nanti otomatis terkirim") -- `localCollection`/`localId` dibawa serta di payload biar begitu
  // retry-nya berhasil belakangan, item lokal yg bersangkutan tetap ketandai `erpName`-nya (lewat
  // markLocalErpName di createDriverActivityOnErp). Resolve ke "synced" | "queued" | "failed" --
  // dipakai pemanggil (mis. addPengecekan) buat efek samping tambahan kalau beneran gagal total.
  const syncDriverActivity = useCallback(
    (payload) => {
      return createDriverActivityOnErp(payload)
        .then(() => {
          toastSynced();
          return "synced";
        })
        .catch((err) => {
          if (isRetriableSyncError(err)) {
            return enqueueSyncJob("driver_activity_create", payload).then(() => {
              refreshPendingSyncCount();
              toastQueued();
              return "queued";
            });
          }
          console.error("Gagal sync Driver Activity ke ERP:", err);
          toastSyncFailed();
          return "failed";
        });
    },
    [createDriverActivityOnErp, refreshPendingSyncCount]
  );

  // Proses ulang antrian offline (semua aksi yg sempat gagal kekirim krn nggak ada sinyal --
  // Transit/Selesai, Driver Log, Aktivitas) begitu: (1) app ini pertama kali dapat identitas
  // login, (2) `isOnline` berubah dari offline ke online (lewat subscribeNetworkStatus di atas --
  // ini jalur TERCEPAT, langsung kedetek begitu sinyal balik, nggak nunggu interval/app
  // foreground), (3) app balik ke foreground (jaring-jaring kalau event network state kebetulan
  // nggak sempat nangkep transisinya), (4) tiap 30 detik selama app di foreground & masih login
  // (jaring-jaring kedua, buat kasus HP/API network state-nya kurang akurat). Dibikin useEffect
  // (bukan dipanggil manual di tiap refreshXxx) biar jalan otomatis tanpa perlu user buka layar
  // tertentu dulu.
  useEffect(() => {
    if (!erpUser) return undefined;
    const executors = {
      delivery_status_update: syncDeliveryStatusToErp,
      driver_log_create: createDriverLogOnErp,
      driver_activity_create: createDriverActivityOnErp,
    };
    const runQueue = () => {
      processSyncQueue(executors, applyQueueSnapshot).catch((err) => console.error("Gagal proses antrian sync offline:", err));
    };
    runQueue();
    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") runQueue();
    });
    const interval = setInterval(runQueue, 30000);
    return () => {
      appStateSub.remove();
      clearInterval(interval);
    };
  }, [erpUser, isOnline, syncDeliveryStatusToErp, createDriverLogOnErp, createDriverActivityOnErp, applyQueueSnapshot]);

  const addExpense = useCallback(
    (expense) => {
      const localId = uid();
      if (expense.kendaraan) setTodaysKendaraan(expense.kendaraan);
      setExpenses((prev) => {
        const next = [...prev, { id: localId, createdAt: Date.now(), ...expense }];
        saveJSON(STORAGE_KEYS.expenses, next);
        return next;
      });
      syncDriverActivity({
        erpTipe: "Pengeluaran",
        deskripsi: expense.deskripsi || "",
        nominal: expense.nominal,
        foto: expense.receiptPhoto,
        kendaraan: expense.kendaraan,
        kategori: categoryMeta(expense.kategori).label,
        km: expense.kategori === "bbm" ? expense.km : null,
        latitude: expense.latitude,
        longitude: expense.longitude,
        alamatLokasi: expense.alamatLokasi,
        localCollection: "expenses",
        localId,
      });
    },
    [syncDriverActivity]
  );

  const deleteExpense = useCallback((id) => {
    setExpenses((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveJSON(STORAGE_KEYS.expenses, next);
      return next;
    });
  }, []);

  const updateExpense = useCallback((id, patch) => {
    setExpenses((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
      saveJSON(STORAGE_KEYS.expenses, next);
      return next;
    });
  }, []);

  const addKendala = useCallback(
    (entry) => {
      const localId = uid();
      if (entry.kendaraan) setTodaysKendaraan(entry.kendaraan);
      setKendala((prev) => {
        const next = [...prev, { id: localId, createdAt: Date.now(), ...entry }];
        saveJSON(STORAGE_KEYS.kendala, next);
        return next;
      });
      const related = entry.relatedDeliveryId ? deliveries.find((d) => d.id === entry.relatedDeliveryId) : null;
      syncDriverActivity({
        erpTipe: "Kendala",
        deskripsi: `${entry.deskripsi || ""}${related && related.noResi ? `${entry.deskripsi ? " " : ""}[DO: ${related.noResi}]` : ""}`,
        foto: entry.foto,
        kendaraan: entry.kendaraan,
        jenisKendala: kendalaTypeLabel(entry.jenisKendala),
        latitude: entry.latitude,
        longitude: entry.longitude,
        alamatLokasi: entry.alamatLokasi,
        localCollection: "kendala",
        localId,
      });
    },
    [syncDriverActivity, deliveries]
  );

  // Edit Kendala/Cuci Kendaraan sama kayak updateExpense -- cuma patch LOKAL (nggak ikut update
  // dokumen yg udah kepalang kebuat di ERP, biar simpel & konsisten sama pattern edit yg sudah ada).
  const updateKendala = useCallback((id, patch) => {
    setKendala((prev) => {
      const next = prev.map((k) => (k.id === id ? { ...k, ...patch } : k));
      saveJSON(STORAGE_KEYS.kendala, next);
      return next;
    });
  }, []);

  const updateCuciKendaraan = useCallback((id, patch) => {
    setCuciKendaraan((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
      saveJSON(STORAGE_KEYS.cuciKendaraan, next);
      return next;
    });
  }, []);

  const addPengecekan = useCallback(
    (entry) => {
      const localId = uid();
      setPengecekan((prev) => {
        const next = [...prev, { id: localId, createdAt: Date.now(), ...entry }];
        saveJSON(STORAGE_KEYS.pengecekan, next);
        return next;
      });
      // Optimis: langsung kebuka gerbang Mulai & field Kendaraan di Aktivitas tanpa nunggu round-
      // trip ke ERP. Kalau ternyata sync-nya gagal total (udah di-rollback di ERP), cek ulang
      // kondisi SEBENARNYA dari ERP lewat refreshTodaysKendaraan() -- biar nggak nyangkut status
      // "udah pengecekan" padahal datanya nggak jadi tersimpan di ERP.
      setTodaysKendaraan(entry.kendaraan || null);
      syncDriverActivity({
        erpTipe: "Pengecekan",
        deskripsi: entry.deskripsi || "",
        foto: entry.foto,
        kendaraan: entry.kendaraan,
        latitude: entry.latitude,
        longitude: entry.longitude,
        alamatLokasi: entry.alamatLokasi,
        localCollection: "pengecekan",
        localId,
      }).then((status) => {
        // Ditolak server (bukan cuma diantri krn sinyal) -- berarti beneran udah dirollback di
        // ERP, cek ulang kondisi SEBENARNYA biar nggak nyangkut status "udah pengecekan" padahal
        // datanya nggak jadi tersimpan. Kalau cuma "queued", datanya msh aman nunggu kekirim.
        if (status === "failed") refreshTodaysKendaraan();
      });
    },
    [syncDriverActivity, refreshTodaysKendaraan]
  );

  const addCuciKendaraan = useCallback(
    (entry) => {
      const localId = uid();
      if (entry.kendaraan) setTodaysKendaraan(entry.kendaraan);
      setCuciKendaraan((prev) => {
        const next = [...prev, { id: localId, createdAt: Date.now(), ...entry }];
        saveJSON(STORAGE_KEYS.cuciKendaraan, next);
        return next;
      });
      syncDriverActivity({
        erpTipe: "Cuci Kendaraan",
        deskripsi: entry.deskripsi || "",
        foto: entry.foto,
        kendaraan: entry.kendaraan,
        latitude: entry.latitude,
        longitude: entry.longitude,
        alamatLokasi: entry.alamatLokasi,
        localCollection: "cuciKendaraan",
        localId,
      });
    },
    [syncDriverActivity]
  );

  const deleteKendala = useCallback((id) => {
    setKendala((prev) => {
      const next = prev.filter((k) => k.id !== id);
      saveJSON(STORAGE_KEYS.kendala, next);
      return next;
    });
  }, []);

  const deletePengecekan = useCallback((id) => {
    setPengecekan((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveJSON(STORAGE_KEYS.pengecekan, next);
      return next;
    });
  }, []);

  const deleteCuciKendaraan = useCallback((id) => {
    setCuciKendaraan((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveJSON(STORAGE_KEYS.cuciKendaraan, next);
      return next;
    });
  }, []);

  // Tarik ulang Driver Activity dari ERP (punya akun yg sedang login), terus pulihkan ke
  // penyimpanan lokal item mana pun yg di ERP ada tapi lokalnya nggak ada (mis. abis local
  // storage ke-reset, ganti HP, dll). Item lokal yg SUDAH tersinkron (punya erpName) dilewati
  // supaya nggak dobel. Item yg dipulihkan ditandai `fromErp: true` -- read-only di mobile.
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const refreshActivities = useCallback(async (opts) => {
    if (!erpUser) return;
    // Lagi ada aksi Aktivitas yg masih dalam proses nyimpen ke ERP -- skip refresh ini dulu,
    // biar nggak restore dokumen yg SAMA sebagai entry kedua (lihat catatan di activitySyncCountRef).
    if (activitySyncCountRef.current > 0) return;
    setActivitiesLoading(true);
    try {
      // `vehicle` field standar (selalu ada, lihat refreshTodaysKendaraan), tapi kategori/km/
      // jenis_kendala/latitude/longitude/alamat_lokasi masih Custom Field baru yg bisa aja belum
      // di-migrate di server ERP.
      const baseFields = ["name", "tipe", "deskripsi", "nominal", "foto", "creation", "vehicle"];
      const extraFields = ["kategori", "km", "jenis_kendala", "latitude", "longitude", "alamat_lokasi"];
      let rows;
      try {
        rows = await erpGetList("Driver Activity", {
          filters: [["owner", "=", erpUser]],
          fields: [...baseFields, ...extraFields],
          limit: 500,
          orderBy: "creation desc",
        });
      } catch (err) {
        if (!isUnknownFieldError(err)) throw err;
        // Custom Field extraFields belum di-migrate di server ERP -- tarik ulang pakai field
        // dasar aja (termasuk `vehicle`, yg selalu aman) biar histori tetap kebaca, field2 baru
        // itu kosong sementara sampai migrasinya kelar.
        rows = await erpGetList("Driver Activity", {
          filters: [["owner", "=", erpUser]],
          fields: baseFields,
          limit: 500,
          orderBy: "creation desc",
        });
      }
      const ignoreKnown = !!(opts && opts.ignoreKnown);
      const mapped = rows.map(mapErpToActivity);
      const byTipe = { pengeluaran: [], kendala: [], pengecekan: [], cuci_kendaraan: [] };
      mapped.forEach((m) => (byTipe[m._tipe] || byTipe.pengeluaran).push(m));

      // "known" (erpName yg udah ada lokal) DIHITUNG DI DALAM functional updater (baca `prev`
      // langsung dari React, bukan dari closure render-time expenses/kendala/dkk yg bisa basi) --
      // biar nggak dobel kalau 2 refreshActivities() nimpa bareng (mis. tab Home & Aktivitas
      // sama2 refresh pas fokus gonta-ganti tab hampir bersamaan). Closure lama di sini sempat
      // bikin 1 aktivitas (mis. Pengecekan) kecatat dobel beberapa kali di list.
      const mergeNew = (setFn, storageKey, items) => {
        if (items.length === 0) return;
        setFn((prev) => {
          const known = ignoreKnown ? new Set() : new Set(prev.map((e) => e.erpName).filter(Boolean));
          const toAdd = items.filter((m) => !known.has(m.erpName));
          if (toAdd.length === 0) return prev;
          const next = [...prev, ...toAdd];
          saveJSON(storageKey, next);
          return next;
        });
      };
      mergeNew(setExpenses, STORAGE_KEYS.expenses, byTipe.pengeluaran);
      mergeNew(setKendala, STORAGE_KEYS.kendala, byTipe.kendala);
      mergeNew(setPengecekan, STORAGE_KEYS.pengecekan, byTipe.pengecekan);
      mergeNew(setCuciKendaraan, STORAGE_KEYS.cuciKendaraan, byTipe.cuci_kendaraan);
    } catch (err) {
      console.error("Gagal fetch Driver Activity dari ERP:", err);
    } finally {
      setActivitiesLoading(false);
    }
  }, [erpUser]);

  // Dipanggil dari tombol refresh di Home (gantiin "Hapus Data Lokal" manual di Profil) -- buang
  // copy lokal buat item yg UDAH kekonfirmasi tersinkron ke ERP (punya `erpName`), biar ERP jadi
  // satu2nya sumber kebenaran & nggak ada data basi/dummy nyangkut, LALU tarik ulang semuanya dari
  // ERP (otomatis balikin lagi item yg barusan dibuang itu, tapi dengan data paling fresh).
  // Item yg BELUM sempat tersinkron (belum punya erpName, mis. koneksi lagi jelek pas submit)
  // SENGAJA DIBIARKAN apa adanya -- supaya refresh biasa nggak pernah bikin data asli yg masih
  // "dalam proses" ke ERP ikut hilang permanen. `deliveries` sengaja nggak disentuh sama sekali di
  // sini (beda dari yg lain) -- field progres lokal-only-nya (pickupPhoto/proofPhoto/dkk, lihat
  // mergeWithLocalProgress) nggak punya padanan field di ERP sama sekali, jadi kalau diwipe duluan
  // bakal ilang permanen; refreshDeliveries() sendiri sudah aman (merge, bukan replace).
  const clearLocalData = useCallback(async () => {
    const dropSynced = (setFn, key) => {
      setFn((prev) => {
        const next = prev.filter((item) => !item.erpName);
        saveJSON(key, next);
        return next;
      });
    };
    dropSynced(setExpenses, STORAGE_KEYS.expenses);
    dropSynced(setKendala, STORAGE_KEYS.kendala);
    dropSynced(setPengecekan, STORAGE_KEYS.pengecekan);
    dropSynced(setCuciKendaraan, STORAGE_KEYS.cuciKendaraan);
    dropSynced(setDriverLogEntries, STORAGE_KEYS.driverLogEntries);
    await Promise.all([refreshDeliveries(), refreshAvailableDeliveries(), refreshActivities(), refreshDriverLog()]);
  }, [refreshDeliveries, refreshAvailableDeliveries, refreshActivities, refreshDriverLog]);

  const value = useMemo(
    () => ({
      loading,
      isLoggedIn,
      erpUser,
      login,
      logout,
      date,
      setDate,
      profile,
      deliveries,
      deliveriesLoading,
      deliveriesError,
      refreshDeliveries,
      availableDeliveries,
      availableDeliveriesLoading,
      refreshAvailableDeliveries,
      sendDelivery,
      expenses,
      kendala,
      pengecekan,
      cuciKendaraan,
      driverLogEntries,
      vehicles,
      vehiclesLoading,
      refreshVehicles,
      vehicleLabel,
      outlets,
      outletsLoading,
      refreshOutlets,
      outletName,
      todaysKendaraan,
      todaysKendaraanLoading,
      refreshTodaysKendaraan,
      updateProfile,
      startDay,
      finishDay,
      transitPickup,
      completeDeliveries,
      addExpense,
      deleteExpense,
      updateExpense,
      addKendala,
      deleteKendala,
      updateKendala,
      addPengecekan,
      deletePengecekan,
      addCuciKendaraan,
      deleteCuciKendaraan,
      updateCuciKendaraan,
      activitiesLoading,
      refreshActivities,
      driverLogLoading,
      refreshDriverLog,
      clearLocalData,
      sheetOpen: openSheetCount > 0,
      pushSheet,
      popSheet,
      isOnline,
      pendingSyncCount,
      pendingDeliveryIds,
    }),
    [
      loading, isLoggedIn, erpUser, login, logout, date, profile, deliveries, deliveriesLoading, deliveriesError, refreshDeliveries,
      availableDeliveries, availableDeliveriesLoading, refreshAvailableDeliveries, sendDelivery,
      expenses, kendala, pengecekan, cuciKendaraan, driverLogEntries,
      vehicles, vehiclesLoading, refreshVehicles, vehicleLabel,
      outlets, outletsLoading, refreshOutlets, outletName,
      todaysKendaraan, todaysKendaraanLoading, refreshTodaysKendaraan,
      updateProfile,
      startDay, finishDay, transitPickup, completeDeliveries,
      addExpense, deleteExpense, updateExpense,
      addKendala, deleteKendala, updateKendala, addPengecekan, deletePengecekan, addCuciKendaraan, deleteCuciKendaraan, updateCuciKendaraan,
      activitiesLoading, refreshActivities,
      driverLogLoading, refreshDriverLog, clearLocalData,
      openSheetCount, pushSheet, popSheet,
      isOnline, pendingSyncCount, pendingDeliveryIds,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
