import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { showStatusPopup } from "../components/StatusPopup";
import { STORAGE_KEYS, loadJSON, saveJSON, defaultProfile } from "../data/storage";
import { todayISO, uid, formatRupiah } from "../utils/format";
import {
  erpGetList,
  erpUpdateDoc,
  erpCreateDoc,
  erpDeleteDoc,
  erpUploadFile,
  erpLogin,
  erpGenerateApiKeys,
  erpGetOwnApiKey,
  setErpCredentials,
  clearErpCredentials,
  ERPNextError,
} from "../api/erpClient";
import { mapErpToDelivery, statusToErp } from "../api/mapDelivery";
import { mapErpToActivity } from "../api/mapActivity";
import { mapErpToDriverLogEntry } from "../api/mapDriverLog";
import { categoryMeta, kendalaTypeLabel } from "../data/constants";

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

const DELIVERY_FIELDS = [
  "name", "creation", "modified", "outlet", "delivery_status", "driver", "vehicle_type", "vehicle",
  "pickup_km", "end_km",
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

export function AppProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [erpUser, setErpUser] = useState(null); // email akun ERP yg sedang login -- dipakai utk fetch balik Driver Activity milik sendiri
  const [date, setDate] = useState(todayISO());
  const [profile, setProfile] = useState(defaultProfile());
  const [deliveries, setDeliveries] = useState([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveriesError, setDeliveriesError] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [kendala, setKendala] = useState([]);
  const [pengecekan, setPengecekan] = useState([]);
  const [cuciKendaraan, setCuciKendaraan] = useState([]);
  const [driverLogEntries, setDriverLogEntries] = useState([]);
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
        const rows = await erpGetList("Delivery Request", {
          fields: DELIVERY_FIELDS,
          // Baru dianggap "resmi ditugaskan" ke mobile kalau 3 syarat ini TERPENUHI SEMUA:
          //  1. driver = Employee kurir yg sedang login
          //  2. delivery_status sudah bukan "Pending" lagi (minimal "Ditugaskan")
          //  3. sudah di-"Assign To" (field bawaan Frappe _assign terisi, lewat tombol
          //     Assign To / ToDo di kartu Delivery Request) -- kalau salah satu dari 3 ini
          //     belum terpenuhi, JANGAN tampil dulu di mobile.
          filters: [
            ["driver", "=", driverId],
            ["delivery_status", "!=", "Pending"],
            ["_assign", "is", "set"],
          ],
          limit: 200,
          orderBy: "creation desc",
        });
        setDeliveries((prev) => {
          const existingById = new Map(prev.map((d) => [d.id, d]));
          const mapped = rows.map((row) => mergeWithLocalProgress(mapErpToDelivery(row), existingById));
          saveJSON(STORAGE_KEYS.deliveries, mapped);
          return mapped;
        });
      } catch (err) {
        console.error("Gagal memuat data pengiriman dari ERP:", err);
        setDeliveriesError(err instanceof ERPNextError ? err.message : "Gagal memuat data dari ERP.");
      } finally {
        setDeliveriesLoading(false);
      }
    },
    [profile.idKurir]
  );

  useEffect(() => {
    if (!loading && isLoggedIn && profile.idKurir) {
      refreshDeliveries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isLoggedIn]);

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
        fields: ["name", "kode", "nama", "is_active"],
        filters: [["is_active", "=", 1]],
        limit: 200,
        orderBy: "nama asc",
      });
      setOutlets(rows);
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
  // field Kendaraan di Aktivitas. Driver Activity nggak punya field kendaraan terstruktur, jadi
  // diambil dgn narik 1 baris Pengecekan terbaru hari ini terus di-parse dari teks deskripsi-nya
  // (formatnya selalu "Kendaraan: <plat> - ..." atau "Kendaraan: <plat>", lihat addPengecekan()).
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
        fields: ["deskripsi", "creation"],
        limit: 1,
        orderBy: "creation desc",
      });
      if (rows.length === 0) {
        setTodaysKendaraan(null);
        return;
      }
      const match = (rows[0].deskripsi || "").match(/Kendaraan:\s*([^-]+)/);
      setTodaysKendaraan(match ? match[1].trim() : null);
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

  const updateDeliveries = useCallback((updater) => {
    setDeliveries((prev) => {
      const next = updater(prev);
      saveJSON(STORAGE_KEYS.deliveries, next);
      return next;
    });
  }, []);

  // Driver Log sekarang LOG KEJADIAN (1 baris ERP baru tiap aksi: Mulai/Transit/Selesai),
  // BUKAN lagi rekap harian yg di-upsert. Field ERP yg dipakai: courier, courier_name, log_date,
  // outlet, km (satu angka generik), status (Select Mulai/Transit/Selesai), notes, custom_foto
  // (foto lokal HP diupload ke sini begitu baris log-nya sukses dibuat). Field2 rekap lama
  // (total_do, delivered, km_start/end, dst) sengaja TIDAK diisi lagi.
  // Driver Log TIDAK punya field kendaraan sendiri di ERP, jadi biar setiap baris log (Mulai/
  // Transit/Selesai/Akhiri Hari) tetap tercatat kendaraannya, diambil otomatis dari Pengecekan
  // Kendaraan hari itu (wajib diisi sekali di awal sebelum Mulai) dan digabung ke depan catatan --
  // driver nggak perlu input ulang kendaraan di tiap aksi.
  // ALL-OR-NOTHING: baris Driver Log di ERP baru dianggap sah (dan local entry baru ditandai
  // `erpName`) kalau dokumennya SEKALIGUS foto buktinya (kalau ada) sama2 sukses. Kalau fotonya
  // gagal diupload, dokumen yg SUDAH terlanjur dibuat di ERP langsung dihapus lagi (rollback) biar
  // nggak ada baris log cacat/tanpa foto yg nyangkut di ERP.
  const addDriverLogEntry = useCallback(
    ({ tipe, km, outlet, photo, deliveryIds, catatan, kendaraan }) => {
      const localId = uid();
      const effectiveKendaraan = kendaraan || todaysKendaraan;
      // Driver bisa ganti kendaraan di aksi manapun (beda dari yg dipilih pas Pengecekan/aksi
      // sebelumnya) -- begitu dipilih, jadikan itu default buat aksi/Aktivitas berikutnya.
      if (kendaraan && kendaraan !== todaysKendaraan) setTodaysKendaraan(kendaraan);
      const catatanWithKendaraan = [effectiveKendaraan ? `Kendaraan: ${effectiveKendaraan}` : null, catatan].filter(Boolean).join(" — ");
      const entry = {
        id: localId,
        date: todayISO(),
        tipe, // "mulai" | "transit" | "selesai" | "selesai_hari" (semua non-mulai/transit disync ke ERP sbg "Selesai")
        km: km ?? null,
        outlet: outlet || null,
        photo: photo || null,
        deliveryIds: deliveryIds || [],
        catatan: catatanWithKendaraan,
        createdAt: Date.now(),
      };
      setDriverLogEntries((prev) => {
        const next = [...prev, entry];
        saveJSON(STORAGE_KEYS.driverLogEntries, next);
        return next;
      });
      const statusErp = tipe === "mulai" ? "Mulai" : tipe === "transit" ? "Transit" : "Selesai";
      const markSynced = (erpName) => {
        setDriverLogEntries((prev) => {
          const next = prev.map((e) => (e.id === localId ? { ...e, erpName } : e));
          saveJSON(STORAGE_KEYS.driverLogEntries, next);
          return next;
        });
      };
      erpCreateDoc("Driver Log", {
        courier: profile.idKurir,
        courier_name: profile.nama,
        log_date: entry.date,
        outlet: entry.outlet,
        km: entry.km,
        status: statusErp,
        notes: entry.catatan,
      })
        .then((doc) => {
          if (!doc) {
            toastSyncFailed();
            return;
          }
          if (entry.photo) {
            erpUploadFile({ doctype: "Driver Log", docname: doc.name, fieldname: "custom_foto", fileUri: entry.photo })
              .then(() => {
                markSynced(doc.name);
                toastSynced();
              })
              .catch((err) => {
                console.error("Gagal upload foto Driver Log ke ERP, rollback dokumen:", err);
                erpDeleteDoc("Driver Log", doc.name).catch((delErr) =>
                  console.error("Gagal rollback Driver Log:", delErr)
                );
                toastSyncFailed();
              });
          } else {
            markSynced(doc.name);
            toastSynced();
          }
        })
        .catch((err) => {
          console.error("Gagal sync Driver Log ke ERP:", err);
          toastSyncFailed();
        });
    },
    [profile.idKurir, profile.nama, todaysKendaraan]
  );

  // Aksi "Mulai" -- 1x di awal hari, KM awal + outlet asal. Tidak terikat ke pengiriman tertentu.
  const startDay = useCallback(
    (km, outlet, photo, kendaraan) => {
      addDriverLogEntry({ tipe: "mulai", km, outlet, photo, kendaraan });
    },
    [addDriverLogEntry]
  );

  // Aksi "Selesaikan Hari Ini" -- 1x di akhir hari, KM akhir. Pasangan dari "Mulai". ERP cuma
  // punya 3 opsi status (Mulai/Transit/Selesai), jadi ini tetap disync sbg "Selesai" juga --
  // dibedakan di mobile lewat tipe lokal "selesai_hari" (vs "selesai" utk selesaikan pengiriman).
  const finishDay = useCallback(
    (km, photo, deskripsi, kendaraan) => {
      addDriverLogEntry({
        tipe: "selesai_hari",
        km,
        photo,
        kendaraan,
        catatan: ["Selesaikan Hari Ini", deskripsi].filter(Boolean).join(" — "),
      });
    },
    [addDriverLogEntry]
  );

  // Aksi "Transit" -- ambil barang di 1 outlet. Khusus jenis "Barang Customer" bisa pilih
  // beberapa pengiriman sekaligus (termasuk yg sumbernya outlet lain -- 1 pengiriman bisa transit
  // di beberapa outlet). Jenis lain (FMCG/F&H.S/MBG/Belanja/Lainnya) nggak terikat ke pengiriman
  // manapun (ids kosong) -- cuma catatan stok/belanja umum. KM & foto sama utk semua pengiriman
  // yg dipilih. Begitu diambil, status pengiriman LANGSUNG "Dalam Perjalanan" (gak ada lagi
  // langkah "Berangkat" terpisah).
  const transitPickup = useCallback(
    (ids, { km, outlet, photo, deskripsi, kendaraan }) => {
      const idSet = new Set(ids);
      updateDeliveries((prev) =>
        prev.map((d) =>
          idSet.has(d.id)
            ? { ...d, pickupAt: Date.now(), pickupKm: km, pickupPhoto: photo, departedAt: Date.now(), status: "dalam_perjalanan" }
            : d
        )
      );
      ids.forEach((id) => {
        erpUpdateDoc("Delivery Request", id, { pickup_km: km, delivery_status: statusToErp("dalam_perjalanan") }).catch((err) =>
          console.error("Gagal update transit ke ERP:", err)
        );
      });
      const catatanParts = [ids.length > 0 ? `Ambil barang: ${ids.join(", ")}` : null, deskripsi].filter(Boolean);
      addDriverLogEntry({ tipe: "transit", km, outlet, photo, deliveryIds: ids, kendaraan, catatan: catatanParts.join(" — ") });
    },
    [updateDeliveries, addDriverLogEntry]
  );

  // Aksi "Selesai" -- bisa pilih beberapa pengiriman sekaligus, ditandai Terkirim bareng dgn
  // KM + foto yg sama.
  const completeDeliveries = useCallback(
    (ids, { km, photo, jenis, deskripsi, kendaraan }) => {
      const idSet = new Set(ids);
      updateDeliveries((prev) =>
        prev.map((d) => (idSet.has(d.id) ? { ...d, status: "terkirim", kmArrival: km, proofPhoto: photo, deliveredAt: Date.now() } : d))
      );
      ids.forEach((id) => {
        erpUpdateDoc("Delivery Request", id, { end_km: km, delivery_status: statusToErp("terkirim") }).catch((err) =>
          console.error("Gagal update selesai ke ERP:", err)
        );
      });
      const catatanParts = [jenis, ids.length > 0 ? `Terkirim: ${ids.join(", ")}` : null, deskripsi].filter(Boolean);
      addDriverLogEntry({ tipe: "selesai", km, photo, deliveryIds: ids, kendaraan, catatan: catatanParts.join(" — ") });
    },
    [updateDeliveries, addDriverLogEntry]
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
    setDriverLogLoading(true);
    try {
      const rows = await erpGetList("Driver Log", {
        filters: [["courier", "=", profile.idKurir]],
        fields: ["name", "log_date", "outlet", "km", "status", "notes", "custom_foto", "creation"],
        limit: 500,
        orderBy: "creation desc",
      });
      const erpNames = new Set(rows.map((r) => r.name));
      const known =
        opts && opts.ignoreKnown ? new Set() : new Set(driverLogEntries.map((e) => e.erpName).filter(Boolean));
      const missing = rows.filter((r) => !known.has(r.name)).map(mapErpToDriverLogEntry);
      setDriverLogEntries((prev) => {
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
  }, [profile.idKurir, driverLogEntries]);

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
  const syncDriverActivity = useCallback(({ erpTipe, deskripsi, nominal, foto }) => {
    return erpCreateDoc("Driver Activity", {
      tipe: erpTipe,
      deskripsi: deskripsi || "",
      nominal: nominal || 0,
    })
      .then((doc) => {
        if (!doc) {
          toastSyncFailed();
          return null;
        }
        if (foto) {
          return erpUploadFile({ doctype: "Driver Activity", docname: doc.name, fieldname: "foto", fileUri: foto })
            .then(() => {
              toastSynced();
              return doc.name;
            })
            .catch((err) => {
              console.error("Gagal upload foto Driver Activity ke ERP, rollback dokumen:", err);
              erpDeleteDoc("Driver Activity", doc.name).catch((delErr) =>
                console.error("Gagal rollback Driver Activity:", delErr)
              );
              toastSyncFailed();
              return null;
            });
        }
        toastSynced();
        return doc.name;
      })
      .catch((err) => {
        console.error("Gagal sync Driver Activity ke ERP:", err);
        toastSyncFailed();
        return null;
      });
  }, []);

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
        deskripsi: `${expense.kendaraan ? "Kendaraan: " + expense.kendaraan + " - " : ""}${categoryMeta(expense.kategori).label} - ${formatRupiah(expense.nominal)}${expense.keterangan ? " - " + expense.keterangan : ""}`,
        nominal: expense.nominal,
        foto: expense.receiptPhoto,
      }).then((erpName) => {
        if (!erpName) return;
        setExpenses((prev) => {
          const next = prev.map((e) => (e.id === localId ? { ...e, erpName } : e));
          saveJSON(STORAGE_KEYS.expenses, next);
          return next;
        });
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
        deskripsi: `${entry.kendaraan ? "Kendaraan: " + entry.kendaraan + " - " : ""}${kendalaTypeLabel(entry.jenisKendala)}${entry.deskripsi ? ": " + entry.deskripsi : ""}${related && related.noResi ? ` [DO: ${related.noResi}]` : ""}`,
        foto: entry.foto,
      }).then((erpName) => {
        if (!erpName) return;
        setKendala((prev) => {
          const next = prev.map((k) => (k.id === localId ? { ...k, erpName } : k));
          saveJSON(STORAGE_KEYS.kendala, next);
          return next;
        });
      });
    },
    [syncDriverActivity, deliveries]
  );

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
        deskripsi: `${entry.kendaraan ? "Kendaraan: " + entry.kendaraan + (entry.deskripsi ? " - " : "") : ""}${entry.deskripsi || ""}`,
        foto: entry.foto,
      }).then((erpName) => {
        if (!erpName) {
          refreshTodaysKendaraan();
          return;
        }
        setPengecekan((prev) => {
          const next = prev.map((p) => (p.id === localId ? { ...p, erpName } : p));
          saveJSON(STORAGE_KEYS.pengecekan, next);
          return next;
        });
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
        deskripsi: `${entry.kendaraan ? "Kendaraan: " + entry.kendaraan + (entry.deskripsi ? " - " : "") : ""}${entry.deskripsi || ""}`,
        foto: entry.foto,
      }).then((erpName) => {
        if (!erpName) return;
        setCuciKendaraan((prev) => {
          const next = prev.map((c) => (c.id === localId ? { ...c, erpName } : c));
          saveJSON(STORAGE_KEYS.cuciKendaraan, next);
          return next;
        });
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
    setActivitiesLoading(true);
    try {
      const rows = await erpGetList("Driver Activity", {
        filters: [["owner", "=", erpUser]],
        fields: ["name", "tipe", "deskripsi", "nominal", "foto", "creation"],
        limit: 500,
        orderBy: "creation desc",
      });
      // ignoreKnown dipakai pas abis clearLocalData() -- closure di sini masih bisa kebawa
      // expenses/kendala/dkk versi SEBELUM dikosongkan (React state update belum nempel di
      // closure yg sama), jadi dipaksa anggap "belum ada yg lokal" biar semua kepulihkan ulang.
      const known =
        opts && opts.ignoreKnown
          ? new Set()
          : new Set([...expenses, ...kendala, ...pengecekan, ...cuciKendaraan].map((item) => item.erpName).filter(Boolean));
      const missing = rows.filter((r) => !known.has(r.name)).map(mapErpToActivity);
      if (missing.length === 0) return;

      const byTipe = { pengeluaran: [], kendala: [], pengecekan: [], cuci_kendaraan: [] };
      missing.forEach((m) => (byTipe[m._tipe] || byTipe.pengeluaran).push(m));

      if (byTipe.pengeluaran.length) {
        setExpenses((prev) => {
          const next = [...prev, ...byTipe.pengeluaran];
          saveJSON(STORAGE_KEYS.expenses, next);
          return next;
        });
      }
      if (byTipe.kendala.length) {
        setKendala((prev) => {
          const next = [...prev, ...byTipe.kendala];
          saveJSON(STORAGE_KEYS.kendala, next);
          return next;
        });
      }
      if (byTipe.pengecekan.length) {
        setPengecekan((prev) => {
          const next = [...prev, ...byTipe.pengecekan];
          saveJSON(STORAGE_KEYS.pengecekan, next);
          return next;
        });
      }
      if (byTipe.cuci_kendaraan.length) {
        setCuciKendaraan((prev) => {
          const next = [...prev, ...byTipe.cuci_kendaraan];
          saveJSON(STORAGE_KEYS.cuciKendaraan, next);
          return next;
        });
      }
    } catch (err) {
      console.error("Gagal fetch Driver Activity dari ERP:", err);
    } finally {
      setActivitiesLoading(false);
    }
  }, [erpUser, expenses, kendala, pengecekan, cuciKendaraan]);

  // Hapus semua cache lokal (pengiriman + 4 jenis aktivitas + riwayat aksi), lalu tarik ulang
  // semuanya langsung dari ERP. Dipakai lewat tombol "Hapus Data Lokal" di Profil -- buat buang
  // data sisa testing/dummy di HP yg nggak pernah (atau gagal) kesinkron ke ERP, supaya yg
  // kelihatan di app abis ini MURNI data yg beneran ada di ERP (kosong kalau ERP-nya kosong).
  const clearLocalData = useCallback(async () => {
    setExpenses([]);
    setKendala([]);
    setPengecekan([]);
    setCuciKendaraan([]);
    setDriverLogEntries([]);
    setDeliveries([]);
    await Promise.all([
      saveJSON(STORAGE_KEYS.expenses, []),
      saveJSON(STORAGE_KEYS.kendala, []),
      saveJSON(STORAGE_KEYS.pengecekan, []),
      saveJSON(STORAGE_KEYS.cuciKendaraan, []),
      saveJSON(STORAGE_KEYS.driverLogEntries, []),
      saveJSON(STORAGE_KEYS.deliveries, []),
    ]);
    await Promise.all([
      refreshDeliveries(),
      refreshActivities({ ignoreKnown: true }),
      refreshDriverLog({ ignoreKnown: true }),
    ]);
  }, [refreshDeliveries, refreshActivities, refreshDriverLog]);

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
      addPengecekan,
      deletePengecekan,
      addCuciKendaraan,
      deleteCuciKendaraan,
      activitiesLoading,
      refreshActivities,
      driverLogLoading,
      refreshDriverLog,
      clearLocalData,
      sheetOpen: openSheetCount > 0,
      pushSheet,
      popSheet,
    }),
    [
      loading, isLoggedIn, erpUser, login, logout, date, profile, deliveries, deliveriesLoading, deliveriesError, refreshDeliveries,
      expenses, kendala, pengecekan, cuciKendaraan, driverLogEntries,
      vehicles, vehiclesLoading, refreshVehicles, vehicleLabel,
      outlets, outletsLoading, refreshOutlets, outletName,
      todaysKendaraan, todaysKendaraanLoading, refreshTodaysKendaraan,
      updateProfile,
      startDay, finishDay, transitPickup, completeDeliveries,
      addExpense, deleteExpense, updateExpense,
      addKendala, deleteKendala, addPengecekan, deletePengecekan, addCuciKendaraan, deleteCuciKendaraan,
      activitiesLoading, refreshActivities,
      driverLogLoading, refreshDriverLog, clearLocalData,
      openSheetCount, pushSheet, popSheet,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
