import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import { useApp } from "../context/AppContext";
import { Card, Badge, FieldLabel, TextField, PrimaryButton } from "../components/ui";
import BottomSheet from "../components/BottomSheet";
import PhotoPicker from "../components/PhotoPicker";
import SelectField from "../components/SelectField";
import MultiSelectField from "../components/MultiSelectField";
import Lightbox from "../components/Lightbox";
import { showConfirmPopup } from "../components/ConfirmPopup";
import AppIcon from "../components/AppIcon";
import { formatDateLabel, formatTimeWIB, greetingWord, todayISO, deliveryPickLabel, deliveryPickSublabel, uid } from "../utils/format";
import { statusLabel, statusKey, statusIconSpec, TRANSIT_TYPES, transitTypeLabel } from "../data/constants";

// Checklist default pengecekan kendaraan -- driver bisa tambah item lain sendiri di form-nya.
const DEFAULT_PENGECEKAN_CHECKLIST = ["Oli", "Ban", "Radiator", "Kebersihan"];

export default function HomeScreen({ navigation }) {
  const { colors } = useAppTheme();
  const {
    profile,
    deliveries,
    deliveriesLoading,
    refreshDeliveries,
    driverLogEntries,
    driverLogLoading,
    refreshDriverLog,
    activitiesLoading,
    refreshActivities,
    outlets,
    outletName,
    vehicles,
    addPengecekan,
    todaysKendaraan,
    refreshTodaysKendaraan,
    startDay,
    finishDay,
    transitPickup,
    completeDeliveries,
  } = useApp();
  const today = todayISO();
  const [lightboxUri, setLightboxUri] = useState(null);
  // Baru dianggap "sudah dicek" abis pengecekan Kendaraan hari ini SELESAI sekali (biar kartu
  // "Pengecekan Wajib" nggak sempat kelip duluan pas Home baru kebuka, sebelum hasil cek dari ERP
  // kembali -- lihat refreshTodaysKendaraan di AppContext.js).
  const [kendaraanChecked, setKendaraanChecked] = useState(false);

  // Driver Log, Aktivitas, & status Pengecekan hari ini (langsung dari ERP, bukan array lokal)
  // direfresh tiap Home dibuka -- sebelumnya cuma layar Log Driver/Aktivitas yg narik ulang, jadi
  // Home bisa nampilin status basi (mis. gerbang Pengecekan nggak kebuka padahal udah dicek, atau
  // "Hari Ini Sudah Selesai" padahal entrinya udah dihapus langsung di ERP).
  useEffect(() => {
    refreshDriverLog();
    refreshActivities();
    refreshTodaysKendaraan().finally(() => setKendaraanChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todays = useMemo(() => deliveries.filter((d) => d.date === today), [deliveries, today]);
  const total = todays.length;
  const ditugaskan = todays.filter((d) => d.status === "ditugaskan" || d.status === "pending").length;
  const dalamPerjalanan = todays.filter((d) => d.status === "dalam_perjalanan").length;
  const terkirim = todays.filter((d) => d.status === "terkirim").length;
  const gagal = todays.filter((d) => d.status === "gagal").length;
  const done = terkirim + gagal;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Seluruh master data outlet aktif dari ERP (bukan cuma yg kebetulan ada di pengiriman hari
  // ini) -- value tetap kode outlet (itu yg disimpan di ERP), label-nya nama outlet yg sebenarnya.
  const outletOptions = useMemo(
    () => outlets.map((o) => ({ label: o.nama || o.kode, value: o.kode })),
    [outlets]
  );

  const todayEntries = useMemo(
    () => driverLogEntries.filter((e) => e.date === today).sort((a, b) => b.createdAt - a.createdAt),
    [driverLogEntries, today]
  );
  const mulaiEntry = todayEntries.find((e) => e.tipe === "mulai");
  const finishEntry = todayEntries.find((e) => e.tipe === "selesai_hari");

  // Pengecekan kendaraan sekarang WAJIB di awal, sebelum "Mulai Hari Ini" -- bukan lagi aktivitas
  // bebas kapan saja lewat menu Aktivitas (lihat ADDABLE_ACTIVITY_TYPES di data/constants.js).
  // `todaysKendaraan` sumbernya ERP langsung (lihat refreshTodaysKendaraan di AppContext.js).
  const hasPengecekanToday = !!todaysKendaraan;
  const vehicleOptions = useMemo(
    () =>
      vehicles.map((v) => ({
        label: [v.plate_number, v.vehicle_type, v.brand].filter(Boolean).join(" · "),
        value: v.plate_number,
      })),
    [vehicles]
  );

  // ===== Pengecekan Kendaraan (gerbang sebelum Mulai) =====
  const [pengecekanOpen, setPengecekanOpen] = useState(false);
  const [pengecekanKendaraan, setPengecekanKendaraan] = useState("");
  const [pengecekanChecklist, setPengecekanChecklist] = useState([]);
  const [pengecekanCustomItem, setPengecekanCustomItem] = useState("");
  const [pengecekanDeskripsi, setPengecekanDeskripsi] = useState("");
  const [pengecekanPhoto, setPengecekanPhoto] = useState(null);

  function openPengecekan() {
    setPengecekanKendaraan(vehicles.length === 1 ? vehicles[0].plate_number : "");
    setPengecekanChecklist(DEFAULT_PENGECEKAN_CHECKLIST.map((label) => ({ id: uid(), label, checked: false, custom: false })));
    setPengecekanCustomItem("");
    setPengecekanDeskripsi("");
    setPengecekanPhoto(null);
    setPengecekanOpen(true);
  }
  function toggleChecklistItem(id) {
    setPengecekanChecklist((prev) => prev.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c)));
  }
  function addChecklistItem() {
    const label = pengecekanCustomItem.trim();
    if (!label) return;
    setPengecekanChecklist((prev) => [...prev, { id: uid(), label, checked: true, custom: true }]);
    setPengecekanCustomItem("");
  }
  function removeChecklistItem(id) {
    setPengecekanChecklist((prev) => prev.filter((c) => c.id !== id));
  }
  function savePengecekan() {
    if (!pengecekanKendaraan) {
      Alert.alert("Lengkapi data", "Kendaraan wajib dipilih.");
      return;
    }
    if (pengecekanChecklist.length === 0 || pengecekanChecklist.some((c) => !c.checked)) {
      Alert.alert("Lengkapi data", "Semua item checklist wajib dicentang.");
      return;
    }
    if (!pengecekanPhoto) {
      Alert.alert("Lengkapi data", "Foto hasil pengecekan wajib diisi.");
      return;
    }
    const checkedItems = pengecekanChecklist.map((c) => c.label);
    const checklistText = `Dicek: ${checkedItems.join(", ")}`;
    const deskripsiFinal = [checklistText, pengecekanDeskripsi.trim()].filter(Boolean).join(" — ");
    addPengecekan({
      date: today,
      kendaraan: pengecekanKendaraan,
      deskripsi: deskripsiFinal,
      foto: pengecekanPhoto,
    });
    setPengecekanOpen(false);
  }

  // ===== Mulai =====
  const [mulaiOpen, setMulaiOpen] = useState(false);
  const [mulaiKm, setMulaiKm] = useState("");
  const [mulaiOutlet, setMulaiOutlet] = useState("");
  const [mulaiKendaraan, setMulaiKendaraan] = useState("");
  const [mulaiPhoto, setMulaiPhoto] = useState(null);

  function openMulai() {
    setMulaiKm("");
    setMulaiOutlet("");
    setMulaiKendaraan(todaysKendaraan || "");
    setMulaiPhoto(null);
    setMulaiOpen(true);
  }
  function saveMulai() {
    const kmNum = Number(mulaiKm);
    if (!kmNum && kmNum !== 0) {
      Alert.alert("Lengkapi data", "KM wajib diisi dengan benar.");
      return;
    }
    if (!mulaiOutlet) {
      Alert.alert("Lengkapi data", "Outlet asal wajib dipilih.");
      return;
    }
    if (!mulaiKendaraan) {
      Alert.alert("Lengkapi data", "Kendaraan wajib dipilih.");
      return;
    }
    if (!mulaiPhoto) {
      Alert.alert("Lengkapi data", "Foto kendaraan/odometer wajib diisi.");
      return;
    }
    startDay(kmNum, mulaiOutlet, mulaiPhoto, mulaiKendaraan);
    setMulaiOpen(false);
  }

  // ===== Transit (ambil barang) =====
  const [transitOpen, setTransitOpen] = useState(false);
  const [transitOutlet, setTransitOutlet] = useState("");
  const [transitSelected, setTransitSelected] = useState([]);
  const [transitKm, setTransitKm] = useState("");
  const [transitKendaraan, setTransitKendaraan] = useState("");
  const [transitPhoto, setTransitPhoto] = useState(null);
  const [transitDeskripsi, setTransitDeskripsi] = useState("");

  // Pilihan pengiriman di Transit opsional & nggak dibatasi outlet yg lagi dipilih (tampil semua
  // pengiriman yg belum selesai) -- bisa jadi 1 pengiriman ngambil barang transit di beberapa
  // outlet berbeda, atau transit-nya nggak terikat pengiriman spesifik sama sekali.
  const transitCandidates = useMemo(
    () => todays.filter((d) => !d.pickupAt && d.status !== "terkirim" && d.status !== "gagal"),
    [todays]
  );
  // Dipakai Selesai buat "Jenis Selesai" (Transit sendiri sudah nggak pakai field jenis lagi).
  const jenisOptions = useMemo(() => TRANSIT_TYPES.map((t) => ({ label: t.label, value: t.id })), []);

  function openTransit() {
    setTransitOutlet("");
    setTransitSelected([]);
    setTransitKm("");
    setTransitKendaraan(todaysKendaraan || "");
    setTransitPhoto(null);
    setTransitDeskripsi("");
    setTransitOpen(true);
  }
  function saveTransit() {
    if (!transitOutlet) {
      Alert.alert("Lengkapi data", "Pilih outlet dulu.");
      return;
    }
    const kmNum = Number(transitKm);
    if (!kmNum || kmNum <= 0) {
      Alert.alert("Lengkapi data", "KM wajib diisi dengan benar.");
      return;
    }
    if (!transitKendaraan) {
      Alert.alert("Lengkapi data", "Kendaraan wajib dipilih.");
      return;
    }
    if (!transitPhoto) {
      Alert.alert("Lengkapi data", "Foto bukti wajib diisi.");
      return;
    }
    transitPickup(transitSelected, {
      km: kmNum,
      outlet: transitOutlet,
      photo: transitPhoto,
      deskripsi: transitDeskripsi.trim(),
      kendaraan: transitKendaraan,
    });
    setTransitOpen(false);
  }

  // ===== Selesai =====
  const [selesaiOpen, setSelesaiOpen] = useState(false);
  const [selesaiJenis, setSelesaiJenis] = useState("");
  const [selesaiSelected, setSelesaiSelected] = useState([]);
  const [selesaiKm, setSelesaiKm] = useState("");
  const [selesaiKendaraan, setSelesaiKendaraan] = useState("");
  const [selesaiDeskripsi, setSelesaiDeskripsi] = useState("");
  const [selesaiPhoto, setSelesaiPhoto] = useState(null);

  const selesaiCandidates = useMemo(() => todays.filter((d) => d.status === "dalam_perjalanan"), [todays]);

  function openSelesai() {
    setSelesaiJenis("");
    setSelesaiSelected([]);
    setSelesaiKm("");
    setSelesaiKendaraan(todaysKendaraan || "");
    setSelesaiDeskripsi("");
    setSelesaiPhoto(null);
    setSelesaiOpen(true);
  }
  function pickSelesaiJenis(val) {
    setSelesaiJenis(val);
    if (val !== "customer") setSelesaiSelected([]);
  }
  function saveSelesai() {
    if (!selesaiJenis) {
      Alert.alert("Lengkapi data", "Jenis selesai wajib dipilih.");
      return;
    }
    if (selesaiJenis === "customer" && selesaiSelected.length === 0) {
      Alert.alert("Lengkapi data", "Pilih minimal 1 pengiriman yang selesai.");
      return;
    }
    const kmNum = Number(selesaiKm);
    if (!kmNum || kmNum <= 0) {
      Alert.alert("Lengkapi data", "KM wajib diisi dengan benar.");
      return;
    }
    if (!selesaiKendaraan) {
      Alert.alert("Lengkapi data", "Kendaraan wajib dipilih.");
      return;
    }
    if (!selesaiPhoto) {
      Alert.alert("Lengkapi data", "Foto bukti wajib diisi.");
      return;
    }
    completeDeliveries(selesaiSelected, {
      km: kmNum,
      photo: selesaiPhoto,
      jenis: transitTypeLabel(selesaiJenis),
      deskripsi: selesaiDeskripsi.trim(),
      kendaraan: selesaiKendaraan,
    });
    setSelesaiOpen(false);
  }

  // ===== Selesaikan Hari Ini (pasangan "Mulai") =====
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishKm, setFinishKm] = useState("");
  const [finishKendaraan, setFinishKendaraan] = useState("");
  const [finishPhoto, setFinishPhoto] = useState(null);
  const [finishDeskripsi, setFinishDeskripsi] = useState("");

  function openFinish() {
    setFinishKm("");
    setFinishKendaraan(todaysKendaraan || "");
    setFinishPhoto(null);
    setFinishDeskripsi("");
    setFinishOpen(true);
  }
  function saveFinish() {
    const kmNum = Number(finishKm);
    if (!kmNum || kmNum <= 0) {
      Alert.alert("Lengkapi data", "KM wajib diisi dengan benar.");
      return;
    }
    if (!finishKendaraan) {
      Alert.alert("Lengkapi data", "Kendaraan wajib dipilih.");
      return;
    }
    if (!finishPhoto) {
      Alert.alert("Lengkapi data", "Foto kendaraan/odometer wajib diisi.");
      return;
    }
    showConfirmPopup({
      title: "Akhiri Hari Ini?",
      message: "Aksi ini menandakan pengiriman kamu hari ini sudah selesai, dan kamu baru bisa mulai pengiriman lagi besok.",
      confirmText: "Ya, Akhiri",
      danger: true,
      onConfirm: () => {
        finishDay(kmNum, finishPhoto, finishDeskripsi.trim(), finishKendaraan);
        setFinishOpen(false);
      },
    });
  }

  const dalamPerjalananOptions = selesaiCandidates.map((d) => ({ label: deliveryPickLabel(d), value: d.id, sublabel: deliveryPickSublabel(d) }));

  function refreshAll() {
    refreshDeliveries();
    refreshDriverLog();
    refreshActivities();
    refreshTodaysKendaraan();
  }
  const refreshing = deliveriesLoading || driverLogLoading || activitiesLoading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={colors.purple2} />}
      >
        <View style={[styles.hero, { backgroundColor: colors.purple2 }]}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroDateNav}>
              <AppIcon name="calendar-outline" size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroDateText}>{formatDateLabel(today)}</Text>
            </View>
            <View style={styles.heroRight}>
              <TouchableOpacity onPress={refreshAll} style={styles.heroIconBtn} disabled={refreshing}>
                <AppIcon name="refresh-outline" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate("Notifications")} style={styles.heroIconBtn}>
                <AppIcon name="notifications-outline" size={18} color="#fff" />
                {ditugaskan > 0 ? (
                  <View style={styles.avatarBadge}>
                    <Text style={styles.avatarBadgeText}>{ditugaskan > 9 ? "9+" : ditugaskan}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ marginTop: 18 }}>
            <Text style={styles.heroGreeting}>
              Selamat {greetingWord()}, {(profile.nama || "Kurir").split(" ")[0]} 👋
            </Text>
            <Text style={styles.heroSubtitle}>ID Kurir: {profile.idKurir || "-"}</Text>
          </View>

          <View style={styles.heroProgressCard}>
            <View style={styles.heroProgressTop}>
              <Text style={styles.heroProgressLabel}>Progress Hari Ini</Text>
              <Text style={styles.heroProgressLabel}>
                {done}/{total} selesai
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
            <View style={styles.heroProgressBottom}>
              <Text style={styles.heroProgressSub}>{pct}% terselesaikan</Text>
              <Text style={styles.heroProgressSub}>{total - done} sisa pengiriman</Text>
            </View>
          </View>
        </View>

        {!kendaraanChecked ? (
          <View style={[styles.gateCard, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center" }]}>
            <ActivityIndicator size="small" color={colors.purple2} />
            <Text style={[styles.gateSub, { color: colors.textMuted, marginTop: 8 }]}>Memeriksa status hari ini...</Text>
          </View>
        ) : !hasPengecekanToday ? (
          <View style={[styles.gateCard, { backgroundColor: colors.card, borderColor: colors.orange }]}>
            <View style={styles.gateHeadRow}>
              <View style={[styles.gateIconCircle, { backgroundColor: colors.orangeSoft }]}>
                <AppIcon name="warning" size={22} color={colors.orange} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.gateTitleRow}>
                  <Text style={[styles.gateTitle, { color: colors.text }]}>Pengecekan Kendaraan</Text>
                  <View style={[styles.gateBadge, { backgroundColor: colors.orange }]}>
                    <Text style={styles.gateBadgeText}>WAJIB</Text>
                  </View>
                </View>
                <Text style={[styles.gateSub, { color: colors.textMuted }]}>
                  Pengiriman hari ini belum bisa dimulai sebelum kendaraan dicek.
                </Text>
              </View>
            </View>
            <PrimaryButton
              title="Mulai Pengecekan"
              icon={{ name: "checkmark-done-outline" }}
              onPress={openPengecekan}
              style={{ backgroundColor: colors.orange, marginTop: 14 }}
            />
          </View>
        ) : !mulaiEntry ? (
          <TouchableOpacity onPress={openMulai} activeOpacity={0.85} style={[styles.mulaiBanner, { backgroundColor: colors.indigoSoft }]}>
            <AppIcon lib="MaterialCommunityIcons" name="flag-checkered" size={26} color={colors.indigo} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.mulaiBannerTitle, { color: colors.indigo }]}>Mulai Hari Ini</Text>
              <Text style={[styles.mulaiBannerSub, { color: colors.textMuted }]}>Isi KM awal & pilih outlet asal</Text>
            </View>
            <AppIcon name="chevron-forward" size={18} color={colors.indigo} />
          </TouchableOpacity>
        ) : finishEntry ? (
          <Card>
            <View style={styles.mulaiHeadRow}>
              <View style={[styles.mulaiIconBadge, { backgroundColor: colors.greenSoft }]}>
                <AppIcon name="checkmark-done-outline" size={20} color={colors.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.mulaiHeadTitle, { color: colors.text }]}>Hari Ini Sudah Selesai</Text>
                <Text style={[styles.mulaiHeadSub, { color: colors.textMuted }]} numberOfLines={1}>
                  KM Akhir {finishEntry.km} · {formatTimeWIB(finishEntry.createdAt)}
                </Text>
              </View>
            </View>
          </Card>
        ) : (
          <Card>
            <View style={styles.mulaiHeadRow}>
              <View style={[styles.mulaiIconBadge, { backgroundColor: colors.indigoSoft }]}>
                <AppIcon lib="MaterialCommunityIcons" name="flag-checkered" size={20} color={colors.indigo} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.mulaiHeadTitle, { color: colors.text }]}>Trip Dimulai</Text>
                <Text style={[styles.mulaiHeadSub, { color: colors.textMuted }]} numberOfLines={1}>
                  KM {mulaiEntry.km} · {outletName(mulaiEntry.outlet)} · {formatTimeWIB(mulaiEntry.createdAt)}
                </Text>
              </View>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity onPress={openTransit} activeOpacity={0.8} style={[styles.actionBtn, { backgroundColor: colors.blueSoft }]}>
                <View style={[styles.actionIconCircle, { backgroundColor: colors.purple2 }]}>
                  <AppIcon name="download-outline" size={18} color="#fff" />
                </View>
                <Text style={[styles.actionBtnText, { color: colors.purple2 }]}>Transit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openSelesai} activeOpacity={0.8} style={[styles.actionBtn, { backgroundColor: colors.greenSoft }]}>
                <View style={[styles.actionIconCircle, { backgroundColor: colors.green }]}>
                  <AppIcon name="checkmark-circle-outline" size={18} color="#fff" />
                </View>
                <Text style={[styles.actionBtnText, { color: colors.green }]}>Selesai</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openFinish} activeOpacity={0.8} style={[styles.actionBtn, { backgroundColor: colors.indigoSoft }]}>
                <View style={[styles.actionIconCircle, { backgroundColor: colors.indigo }]}>
                  <AppIcon name="flag-outline" size={18} color="#fff" />
                </View>
                <Text style={[styles.actionBtnText, { color: colors.indigo }]} numberOfLines={1}>Akhiri Hari</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        <View style={styles.sectionHeadRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Statistik Hari Ini</Text>
        </View>
        <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Ringkasan status semua pengiriman kamu</Text>

        <View style={cardStyles.statGrid}>
          <StatTile icon="time-outline" color={colors.orange} soft={colors.orangeSoft} label="Ditugaskan" value={ditugaskan} colors={colors} />
          <StatTile icon="sync-outline" color={colors.indigo} soft={colors.indigoSoft} label="Dalam Perjalanan" value={dalamPerjalanan} colors={colors} />
          <StatTile icon="checkmark-circle-outline" color={colors.green} soft={colors.greenSoft} label="Terkirim" value={terkirim} colors={colors} />
          <StatTile icon="close-circle-outline" color={colors.red} soft={colors.redSoft} label="Gagal" value={gagal} colors={colors} />
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Pengiriman Hari Ini</Text>
          {total > 0 ? (
            <TouchableOpacity
              onPress={() => navigation.getParent()?.navigate("Pengiriman")}
              style={[styles.linkPill, { backgroundColor: colors.blueSoft }]}
            >
              <Text style={[styles.linkPillText, { color: colors.purple2 }]}>Lihat Semua</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
          Ditugaskan oleh admin — tap untuk lihat detail & riwayat
        </Text>

        {todays.length === 0 ? (
          <Card>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Belum ada pengiriman untuk hari ini.</Text>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {todays.slice(0, 3).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.deliveryRow, { backgroundColor: colors.card }]}
                onPress={() => navigation.getParent()?.navigate("Pengiriman", { screen: "DeliveryDetail", params: { id: item.id } })}
                activeOpacity={0.85}
              >
                {item.proofPhoto ? (
                  <TouchableOpacity onPress={() => setLightboxUri(item.proofPhoto)}>
                    <Image source={{ uri: item.proofPhoto }} style={styles.itemThumb} />
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.itemRowIcon, { backgroundColor: colors[statusKey(item.status) + "Soft"] }]}>
                    <AppIcon {...statusIconSpec(item.status)} size={16} color={colors[statusKey(item.status)]} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>{item.penerima}</Text>
                  <Text style={[styles.itemSub, { color: colors.textMuted }]} numberOfLines={1}>{item.alamat}</Text>
                </View>
                <Badge label={statusLabel(item.status)} colorKey={statusKey(item.status)} />
                <AppIcon name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            ))}
            {total > 3 ? (
              <Text style={[styles.moreHint, { color: colors.textMuted }]}>+{total - 3} pengiriman lainnya</Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      <BottomSheet visible={pengecekanOpen} onClose={() => setPengecekanOpen(false)} title="Pengecekan Kendaraan">
        <FieldLabel required>Kendaraan</FieldLabel>
        <SelectField value={pengecekanKendaraan} options={vehicleOptions} placeholder="Pilih kendaraan..." onChange={setPengecekanKendaraan} />

        <FieldLabel required>Checklist Pengecekan</FieldLabel>
        <View style={{ gap: 8, marginTop: 8 }}>
          {pengecekanChecklist.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => toggleChecklistItem(item.id)}
              activeOpacity={0.8}
              style={[checklistStyles.row, { borderColor: colors.border, backgroundColor: colors.bg }]}
            >
              <View
                style={[
                  checklistStyles.box,
                  { borderColor: item.checked ? colors.orange : colors.border, backgroundColor: item.checked ? colors.orange : "transparent" },
                ]}
              >
                {item.checked ? <AppIcon name="checkmark" size={13} color="#fff" /> : null}
              </View>
              <Text style={[checklistStyles.label, { color: colors.text }]}>{item.label}</Text>
              {item.custom ? (
                <TouchableOpacity onPress={() => removeChecklistItem(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <AppIcon name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8 }}>
          <TextField
            value={pengecekanCustomItem}
            onChangeText={setPengecekanCustomItem}
            placeholder="Tambah lainnya..."
            style={{ flex: 1 }}
            onSubmitEditing={addChecklistItem}
            returnKeyType="done"
          />
          <TouchableOpacity onPress={addChecklistItem} style={[checklistStyles.addBtn, { backgroundColor: colors.orange }]}>
            <AppIcon name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <FieldLabel>Catatan Tambahan (opsional)</FieldLabel>
        <TextField
          value={pengecekanDeskripsi}
          onChangeText={setPengecekanDeskripsi}
          placeholder="Contoh: rem agak kurang pakem, perlu diperiksa bengkel"
          multiline
          numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: "top" }}
        />
        <FieldLabel required>Foto</FieldLabel>
        <PhotoPicker value={pengecekanPhoto} onChange={setPengecekanPhoto} onPressPreview={setLightboxUri} />
        <PrimaryButton title="Simpan Pengecekan" icon={{ name: "checkmark-done-outline" }} onPress={savePengecekan} />
      </BottomSheet>

      <BottomSheet visible={mulaiOpen} onClose={() => setMulaiOpen(false)} title="Mulai Hari Ini">
        <FieldLabel required>KM Saat Ini</FieldLabel>
        <TextField value={mulaiKm} onChangeText={setMulaiKm} keyboardType="numeric" placeholder="Contoh: 12500" />
        <FieldLabel required>Outlet Asal</FieldLabel>
        <SelectField value={mulaiOutlet} options={outletOptions} placeholder="Pilih outlet..." onChange={setMulaiOutlet} />
        <FieldLabel required>Kendaraan</FieldLabel>
        <SelectField value={mulaiKendaraan} options={vehicleOptions} placeholder="Pilih kendaraan..." onChange={setMulaiKendaraan} />
        <FieldLabel required>Foto Kendaraan/Odometer</FieldLabel>
        <PhotoPicker value={mulaiPhoto} onChange={setMulaiPhoto} onPressPreview={setLightboxUri} />
        <PrimaryButton title="Mulai" icon={{ lib: "MaterialCommunityIcons", name: "flag-checkered" }} onPress={saveMulai} />
      </BottomSheet>

      <BottomSheet visible={finishOpen} onClose={() => setFinishOpen(false)} title="Selesaikan Hari Ini">
        {total - done > 0 ? (
          <Text style={{ color: "#d97706", fontSize: 12.5, fontFamily: fontFamily.semiBold, marginBottom: 4 }}>
            Masih ada {total - done} pengiriman belum selesai hari ini.
          </Text>
        ) : null}
        <FieldLabel required>KM Saat Ini</FieldLabel>
        <TextField value={finishKm} onChangeText={setFinishKm} keyboardType="numeric" placeholder="Contoh: 12600" />
        <FieldLabel required>Kendaraan</FieldLabel>
        <SelectField value={finishKendaraan} options={vehicleOptions} placeholder="Pilih kendaraan..." onChange={setFinishKendaraan} />
        <FieldLabel>Catatan (opsional)</FieldLabel>
        <TextField
          value={finishDeskripsi}
          onChangeText={setFinishDeskripsi}
          placeholder="Catatan tambahan (opsional)"
          multiline
          numberOfLines={3}
          style={{ minHeight: 70, textAlignVertical: "top" }}
        />
        <FieldLabel required>Foto Kendaraan/Odometer</FieldLabel>
        <PhotoPicker value={finishPhoto} onChange={setFinishPhoto} onPressPreview={setLightboxUri} />
        <PrimaryButton title="Selesaikan Hari Ini" icon={{ name: "flag-outline" }} onPress={saveFinish} />
      </BottomSheet>

      <BottomSheet visible={transitOpen} onClose={() => setTransitOpen(false)} title="Transit — Ambil Barang">
        <FieldLabel required>Outlet</FieldLabel>
        <SelectField value={transitOutlet} options={outletOptions} placeholder="Pilih outlet..." onChange={setTransitOutlet} />
        <FieldLabel>Pengiriman yang Diambil (opsional)</FieldLabel>
        {transitCandidates.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4 }}>
            Tidak ada pengiriman yang perlu diambil.
          </Text>
        ) : (
          <MultiSelectField
            items={transitCandidates.map((d) => ({ id: d.id, label: deliveryPickLabel(d), sublabel: deliveryPickSublabel(d) }))}
            selectedIds={transitSelected}
            onChange={setTransitSelected}
            placeholder="Pilih pengiriman (opsional)..."
          />
        )}
        <FieldLabel required>KM Saat Ini</FieldLabel>
        <TextField value={transitKm} onChangeText={setTransitKm} keyboardType="numeric" placeholder="Contoh: 12520" />
        <FieldLabel required>Kendaraan</FieldLabel>
        <SelectField value={transitKendaraan} options={vehicleOptions} placeholder="Pilih kendaraan..." onChange={setTransitKendaraan} />
        <FieldLabel>Deskripsi (opsional)</FieldLabel>
        <TextField
          value={transitDeskripsi}
          onChangeText={setTransitDeskripsi}
          placeholder="Catatan tambahan (opsional)"
          multiline
          numberOfLines={3}
          style={{ minHeight: 70, textAlignVertical: "top" }}
        />
        <FieldLabel required>Foto Bukti Ambil Barang</FieldLabel>
        <PhotoPicker value={transitPhoto} onChange={setTransitPhoto} onPressPreview={setLightboxUri} />
        <PrimaryButton
          title={transitSelected.length > 0 ? `Konfirmasi Transit (${transitSelected.length} paket)` : "Konfirmasi Transit"}
          icon={{ name: "download-outline" }}
          onPress={saveTransit}
        />
      </BottomSheet>

      <BottomSheet visible={selesaiOpen} onClose={() => setSelesaiOpen(false)} title="Tandai Selesai">
        <FieldLabel required>Jenis Selesai</FieldLabel>
        <SelectField
          value={selesaiJenis}
          options={jenisOptions}
          placeholder="Pilih jenis selesai..."
          onChange={pickSelesaiJenis}
        />
        {selesaiJenis === "customer" ? (
          selesaiCandidates.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4 }}>Belum ada pengiriman yang sedang dalam perjalanan.</Text>
          ) : (
            <>
              <FieldLabel required>Pengiriman yang Selesai</FieldLabel>
              <MultiSelectField
                items={dalamPerjalananOptions.map((o) => ({ id: o.value, label: o.label, sublabel: o.sublabel }))}
                selectedIds={selesaiSelected}
                onChange={setSelesaiSelected}
                placeholder="Pilih pengiriman..."
              />
            </>
          )
        ) : null}
        <FieldLabel required>KM Saat Ini</FieldLabel>
        <TextField value={selesaiKm} onChangeText={setSelesaiKm} keyboardType="numeric" placeholder="Contoh: 12580" />
        <FieldLabel required>Kendaraan</FieldLabel>
        <SelectField value={selesaiKendaraan} options={vehicleOptions} placeholder="Pilih kendaraan..." onChange={setSelesaiKendaraan} />
        <FieldLabel>Deskripsi (opsional)</FieldLabel>
        <TextField
          value={selesaiDeskripsi}
          onChangeText={setSelesaiDeskripsi}
          placeholder="Catatan tambahan (opsional)"
          multiline
          numberOfLines={3}
          style={{ minHeight: 70, textAlignVertical: "top" }}
        />
        <FieldLabel required>Foto Bukti Pengiriman</FieldLabel>
        <PhotoPicker value={selesaiPhoto} onChange={setSelesaiPhoto} onPressPreview={setLightboxUri} />
        <PrimaryButton
          title={selesaiSelected.length > 0 ? `Selesai (${selesaiSelected.length} paket)` : "Selesai"}
          icon={{ name: "checkmark-circle-outline" }}
          onPress={saveSelesai}
        />
      </BottomSheet>

      <Lightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </SafeAreaView>
  );
}

function StatTile({ icon, color, soft, label, value, colors }) {
  return (
    <View style={[cardStyles.statTile, { backgroundColor: colors.card }]}>
      <View style={[cardStyles.statIconCircle, { backgroundColor: soft }]}>
        <AppIcon name={icon} size={16} color={color} />
      </View>
      <Text style={[cardStyles.statTileValue, { color: colors.text }]}>{value}</Text>
      <Text style={[cardStyles.statTileLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const checklistStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: radius.sm, paddingVertical: 11, paddingHorizontal: 12 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 14, fontFamily: fontFamily.medium },
  addBtn: { width: 44, height: 44, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
});

const cardStyles = StyleSheet.create({
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statTile: { width: "48%", borderRadius: radius.md, padding: 14 },
  statIconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  statTileValue: { fontSize: 22, fontFamily: fontFamily.extraBold },
  statTileLabel: { fontSize: 12, fontFamily: fontFamily.semiBold, marginTop: 2 },
});

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 140 },
  hero: { borderRadius: radius.lg, padding: 20, marginBottom: 16 },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroDateNav: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  heroDateText: { color: "rgba(255,255,255,0.9)", fontSize: 12.5, fontFamily: fontFamily.bold },
  heroRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroIconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  avatarBadge: {
    position: "absolute", top: -3, right: -3, backgroundColor: "#ef4444", minWidth: 16, height: 16, borderRadius: 999,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 3, borderWidth: 2, borderColor: "#78008e",
  },
  avatarBadgeText: { color: "#fff", fontSize: 9, fontFamily: fontFamily.extraBold },
  heroGreeting: { color: "#fff", fontSize: 19, fontFamily: fontFamily.extraBold },
  heroSubtitle: { color: "rgba(255,255,255,0.85)", fontSize: 12.5, marginTop: 3, fontFamily: fontFamily.semiBold },
  heroProgressCard: {
    marginTop: 18, backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    borderRadius: radius.sm, padding: 14,
  },
  heroProgressTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  heroProgressLabel: { color: "#fff", fontSize: 13, fontFamily: fontFamily.bold },
  progressTrack: { backgroundColor: "rgba(255,255,255,0.22)", height: 11, borderRadius: 20, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 20 },
  heroProgressBottom: { flexDirection: "row", justifyContent: "space-between", marginTop: 9 },
  heroProgressSub: { color: "rgba(255,255,255,0.85)", fontSize: 11.5, fontFamily: fontFamily.semiBold },
  mulaiBanner: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, padding: 16, marginBottom: 16 },
  mulaiBannerTitle: { fontSize: 14.5, fontFamily: fontFamily.extraBold },
  mulaiBannerSub: { fontSize: 12, marginTop: 2 },
  gateCard: { borderRadius: radius.md, borderWidth: 1.5, padding: 16, marginBottom: 16 },
  gateHeadRow: { flexDirection: "row", gap: 12 },
  gateIconCircle: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  gateTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  gateTitle: { fontSize: 14.5, fontFamily: fontFamily.extraBold },
  gateBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  gateBadgeText: { color: "#fff", fontSize: 10, fontFamily: fontFamily.extraBold, letterSpacing: 0.3 },
  gateSub: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  mulaiHeadRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  mulaiIconBadge: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  mulaiHeadTitle: { fontSize: 14.5, fontFamily: fontFamily.extraBold },
  mulaiHeadSub: { fontSize: 12, marginTop: 2, fontFamily: fontFamily.semiBold },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 7, borderRadius: radius.md, paddingVertical: 14 },
  actionIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  actionBtnText: { fontSize: 12.5, fontFamily: fontFamily.bold },
  sectionHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 5 },
  sectionTitle: { fontSize: 15.5, fontFamily: fontFamily.bold, flexShrink: 1, marginRight: 8 },
  linkPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, flexShrink: 0 },
  linkPillText: { fontSize: 13, fontFamily: fontFamily.bold },
  sectionSub: { fontSize: 12, marginTop: 4, marginBottom: 12 },
  emptyText: { fontSize: 14, textAlign: "center", paddingVertical: 4 },
  moreHint: { fontSize: 12, textAlign: "center", marginTop: 4, fontFamily: fontFamily.semiBold },
  deliveryRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.md, padding: 14 },
  itemRowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  itemThumb: { width: 38, height: 38, borderRadius: 10 },
  itemTitle: { fontSize: 14, fontFamily: fontFamily.bold },
  itemSub: { fontSize: 12.5, marginTop: 2 },
});
