import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import { useApp } from "../context/AppContext";
import { FieldLabel, TextField, PrimaryButton, Chip, OptionItem } from "../components/ui";
import BottomSheet from "../components/BottomSheet";
import PhotoPicker from "../components/PhotoPicker";
import Lightbox from "../components/Lightbox";
import SelectField from "../components/SelectField";
import DateRangeSheet from "../components/DateRangeSheet";
import AppIcon from "../components/AppIcon";
import { formatRupiah, formatTimeWIB, formatDateRangeLabel, todayISO, shiftDateISO, deliveryPickLabel, deliveryPickSublabel } from "../utils/format";
import { captureLocationSilently } from "../utils/location";
import {
  ACTIVITY_TYPES,
  ADDABLE_ACTIVITY_TYPES,
  activityTypeMeta,
  EXPENSE_CATEGORIES,
  categoryMeta,
  KENDALA_TYPES,
  kendalaTypeLabel,
} from "../data/constants";

export default function ActivityScreen() {
  const { colors } = useAppTheme();
  const {
    deliveries,
    expenses,
    kendala,
    pengecekan,
    cuciKendaraan,
    addExpense,
    addKendala,
    addCuciKendaraan,
    activitiesLoading,
    refreshActivities,
    vehicles,
    vehicleLabel,
    todaysKendaraan,
    refreshTodaysKendaraan,
  } = useApp();

  // Dilebarin ke 3 hari terakhir (bukan literally hari ini) -- biar pesanan yg dibuat admin
  // beberapa hari lalu tapi BARU ditugaskan belakangan tetap bisa dipilih buat dikaitkan ke
  // laporan Kendala. Sinkron sama pola yg sama di DeliveriesScreen.js & HomeScreen.js.
  const todaysDeliveries = useMemo(() => {
    const today = todayISO();
    const start = shiftDateISO(today, -2);
    return deliveries.filter((d) => d.date >= start && d.date <= today);
  }, [deliveries]);

  const kategoriOptions = useMemo(() => EXPENSE_CATEGORIES.map((c) => ({ label: c.label, value: c.id })), []);
  const vehicleOptions = useMemo(
    () =>
      vehicles.map((v) => ({
        label: [v.plate_number, v.vehicle_type, v.brand].filter(Boolean).join(" · "),
        value: v.plate_number,
      })),
    [vehicles]
  );

  // Tarik ulang SETIAP tab ini dibuka/difokus (bukan cuma sekali pas mount) -- dipakai utk
  // pulihkan aktivitas yg sudah tersimpan di ERP tapi copy lokalnya hilang (mis. abis Kosongkan
  // Data Lokal versi lama, ganti HP, dll), DAN supaya aksi yg baru dicatat di tab lain (mis.
  // Pengecekan Kendaraan sebelum "Mulai" di Home) langsung kelihatan begitu balik ke tab ini --
  // react-navigation nggak unmount tab yg sudah pernah dibuka, jadi useEffect([]) biasa cuma
  // jalan sekali & jadi basi kalau tab-nya dibuka lagi tanpa remount. Kendaraan hari ini juga
  // dicek ulang LANGSUNG ke ERP (bukan nebak dari array lokal `pengecekan`) tiap kali, biar default
  // kendaraan di form Aktivitas (editable, lihat state `kendaraan`) akurat.
  useFocusEffect(
    useCallback(() => {
      refreshActivities();
      refreshTodaysKendaraan();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // Gabungkan 4 sumber data lokal (Pengeluaran/Kendala/Pengecekan/Cuci Kendaraan) jadi 1 list,
  // sesuai 1 doctype "Driver Activity" di ERP yang menaungi semuanya lewat field "tipe".
  const allActivities = useMemo(() => {
    const a = [];
    expenses.forEach((e) => a.push({ ...e, _tipe: "pengeluaran" }));
    kendala.forEach((k) => a.push({ ...k, _tipe: "kendala" }));
    pengecekan.forEach((p) => a.push({ ...p, _tipe: "pengecekan" }));
    cuciKendaraan.forEach((c) => a.push({ ...c, _tipe: "cuci_kendaraan" }));
    return a;
  }, [expenses, kendala, pengecekan, cuciKendaraan]);

  const [filterStart, setFilterStart] = useState(todayISO());
  const [filterEnd, setFilterEnd] = useState(todayISO());
  const [typeFilter, setTypeFilter] = useState(null);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  const inDateRange = useMemo(
    () => (filterStart ? allActivities.filter((a) => a.date >= filterStart && a.date <= filterEnd) : allActivities),
    [allActivities, filterStart, filterEnd]
  );
  const sorted = useMemo(() => {
    const list = typeFilter ? inDateRange.filter((a) => a._tipe === typeFilter) : inDateRange.slice();
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [inDateRange, typeFilter]);
  const countFor = (id) => inDateRange.filter((a) => a._tipe === id).length;
  const totalPengeluaran = useMemo(
    () => inDateRange.filter((a) => a._tipe === "pengeluaran").reduce((s, e) => s + (Number(e.nominal) || 0), 0),
    [inDateRange]
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [tipe, setTipe] = useState("pengeluaran");
  const [kendaraan, setKendaraan] = useState("");
  const [kategori, setKategori] = useState(EXPENSE_CATEGORIES[0].id);
  const [expenseKm, setExpenseKm] = useState("");
  const [nominal, setNominal] = useState("");
  const [receiptPhoto, setReceiptPhoto] = useState(null);
  const [jenisKendala, setJenisKendala] = useState(KENDALA_TYPES[0].id);
  const [resiId, setResiId] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [activityPhoto, setActivityPhoto] = useState(null);
  const [lightboxUri, setLightboxUri] = useState(null);
  const [detailItem, setDetailItem] = useState(null);

  // Rincian lengkap item yg lagi dibuka di sheet detail -- field-nya beda2 per tipe aktivitas.
  const detailFields = useMemo(() => {
    if (!detailItem) return [];
    const item = detailItem;
    if (item._tipe === "pengeluaran") {
      const cat = item.fromErp ? null : categoryMeta(item.kategori);
      return [
        cat ? { label: "Kategori", value: cat.label } : null,
        { label: "Jumlah", value: formatRupiah(item.nominal) },
        item.kategori === "bbm" && item.km ? { label: "KM", value: String(item.km) } : null,
        item.keterangan || item.deskripsi ? { label: "Deskripsi", value: item.keterangan || item.deskripsi } : null,
        item.kendaraan ? { label: "Kendaraan", value: vehicleLabel(item.kendaraan) } : null,
      ].filter(Boolean);
    }
    if (item._tipe === "kendala") {
      const related = item.relatedDeliveryId ? deliveries.find((d) => d.id === item.relatedDeliveryId) : null;
      return [
        { label: "Jenis Kendala", value: item.jenisKendala ? kendalaTypeLabel(item.jenisKendala) : "Lainnya" },
        related ? { label: "Pengiriman Terkait", value: `${deliveryPickLabel(related)}${related.noResi ? " (" + related.noResi + ")" : ""}` } : null,
        item.kendaraan ? { label: "Kendaraan", value: vehicleLabel(item.kendaraan) } : null,
        item.deskripsi ? { label: "Deskripsi", value: item.deskripsi } : null,
      ].filter(Boolean);
    }
    return [
      item.kendaraan ? { label: "Kendaraan", value: vehicleLabel(item.kendaraan) } : null,
      item.deskripsi ? { label: "Deskripsi", value: item.deskripsi } : null,
      item.alamatLokasi ? { label: "Lokasi", value: item.alamatLokasi } : null,
    ].filter(Boolean);
  }, [detailItem, deliveries, vehicleLabel]);
  const detailPhoto = detailItem
    ? detailItem._tipe === "pengeluaran"
      ? detailItem.receiptPhoto || detailItem.foto
      : detailItem.foto
    : null;

  function resetForm(nextTipe) {
    setTipe(nextTipe);
    setKendaraan(todaysKendaraan || "");
    setKategori(EXPENSE_CATEGORIES[0].id);
    setExpenseKm("");
    setNominal("");
    setReceiptPhoto(null);
    setJenisKendala(KENDALA_TYPES[0].id);
    setResiId("");
    setDeskripsi("");
    setActivityPhoto(null);
  }

  function openAddModal() {
    resetForm("pengeluaran");
    setModalOpen(true);
    refreshTodaysKendaraan(); // pastikan default kendaraan di form sesuai ERP terbaru
  }

  // Semua jenis Aktivitas (Pengeluaran/Kendala/Cuci Kendaraan) sekarang ikut nangkep lokasi
  // (lat/long + alamat) DIAM-DIAM pas submit, sama kayak Pengecekan -- bukan cuma Pengecekan lagi.
  // captureLocationSilently() aman dipanggil meski izin lokasi ditolak/GPS gagal (balikin null),
  // nggak nge-block submit aktivitas lain yg wajib (foto/deskripsi/dll tetap jalan normal).
  async function save() {
    if (!kendaraan) {
      Alert.alert("Lengkapi data", "Kendaraan wajib dipilih.");
      return;
    }
    if (tipe === "pengeluaran") {
      const nominalNum = Number(nominal);
      if (!nominalNum || nominalNum <= 0) {
        Alert.alert("Lengkapi data", "Jumlah pengeluaran wajib diisi dengan benar.");
        return;
      }
      const kmNum = Number(expenseKm);
      if (kategori === "bbm" && (!kmNum || kmNum <= 0)) {
        Alert.alert("Lengkapi data", "KM saat ini wajib diisi dengan benar.");
        return;
      }
      if (!receiptPhoto) {
        Alert.alert("Lengkapi data", "Foto struk wajib diisi.");
        return;
      }
    } else if (tipe === "kendala") {
      if (!activityPhoto) {
        Alert.alert("Lengkapi data", "Foto wajib diisi.");
        return;
      }
    } else {
      if (!deskripsi.trim()) {
        Alert.alert("Lengkapi data", "Deskripsi wajib diisi.");
        return;
      }
      if (!activityPhoto) {
        Alert.alert("Lengkapi data", "Foto wajib diisi.");
        return;
      }
    }

    const location = await captureLocationSilently();
    const locationFields = { latitude: location?.latitude, longitude: location?.longitude, alamatLokasi: location?.address };

    if (tipe === "pengeluaran") {
      const nominalNum = Number(nominal);
      const kmNum = Number(expenseKm);
      const km = kategori === "bbm" ? kmNum : null;
      addExpense({ date: todayISO(), kategori, deskripsi: deskripsi.trim(), nominal: nominalNum, receiptPhoto, kendaraan, km, ...locationFields });
    } else if (tipe === "kendala") {
      addKendala({
        date: todayISO(),
        jenisKendala,
        deskripsi: deskripsi.trim(),
        relatedDeliveryId: resiId || null,
        kendaraan,
        foto: activityPhoto,
        ...locationFields,
      });
    } else {
      addCuciKendaraan({ date: todayISO(), kendaraan, deskripsi: deskripsi.trim(), foto: activityPhoto, ...locationFields });
    }
    setFilterStart(todayISO());
    setFilterEnd(todayISO());
    setModalOpen(false);
  }

  const resiOptions = [
    { label: "Pilih ID pengiriman (opsional)...", value: "" },
    ...todaysDeliveries.map((d) => ({ label: deliveryPickLabel(d), value: d.id, sublabel: deliveryPickSublabel(d) })),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={activitiesLoading} onRefresh={refreshActivities} tintColor={colors.purple2} />}
      >
        <View style={[styles.hero, { backgroundColor: colors.purple2 }]}>
          <View style={styles.heroTop}>
            <Text style={styles.heroTitle}>Aktivitas</Text>
            <TouchableOpacity onPress={openAddModal} style={styles.addBtn}>
              <AppIcon name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Total Pengeluaran</Text>
            <Text style={styles.summaryValue}>{formatRupiah(totalPengeluaran)}</Text>
          </View>
        </View>

        <View style={styles.filterHeadRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Riwayat Aktivitas</Text>
          <TouchableOpacity onPress={() => setDateSheetOpen(true)} style={[styles.filterPill, { backgroundColor: colors.blueSoft }]}>
            <AppIcon name="calendar-outline" size={13} color={colors.purple2} />
            <Text style={[styles.filterPillText, { color: colors.purple2 }]}>{formatDateRangeLabel(filterStart, filterEnd)}</Text>
            <AppIcon name="chevron-down" size={13} color={colors.purple2} />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeFilterRow} contentContainerStyle={{ gap: 8 }}>
          <Chip label={`Semua (${inDateRange.length})`} selected={!typeFilter} onPress={() => setTypeFilter(null)} />
          {ACTIVITY_TYPES.map((t) => (
            <Chip
              key={t.id}
              label={`${t.label} (${countFor(t.id)})`}
              icon={t.icon}
              selected={typeFilter === t.id}
              onPress={() => setTypeFilter(typeFilter === t.id ? null : t.id)}
            />
          ))}
        </ScrollView>

        {sorted.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>Belum ada aktivitas untuk filter ini.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {sorted.map((item) => (
              <ActivityRow
                key={`${item._tipe}-${item.id}`}
                item={item}
                colors={colors}
                deliveries={deliveries}
                vehicleLabel={vehicleLabel}
                onPress={() => setDetailItem(item)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <BottomSheet visible={modalOpen} onClose={() => setModalOpen(false)} title="Catat Aktivitas">
        <FieldLabel>Tipe Aktivitas</FieldLabel>
        <View style={styles.tipeRow}>
          {ADDABLE_ACTIVITY_TYPES.map((t) => (
            <Chip
              key={t.id}
              label={t.label}
              selected={tipe === t.id}
              onPress={() => resetForm(t.id)}
              style={styles.tipeChip}
              textStyle={styles.tipeChipText}
            />
          ))}
        </View>

        <FieldLabel required>Kendaraan</FieldLabel>
        <SelectField value={kendaraan} options={vehicleOptions} placeholder="Pilih kendaraan..." onChange={setKendaraan} />

        {tipe === "pengeluaran" ? (
          <>
            <FieldLabel>Kategori</FieldLabel>
            <SelectField value={kategori} options={kategoriOptions} placeholder="Pilih kategori..." onChange={setKategori} />
            {kategori === "bbm" ? (
              <>
                <FieldLabel required>KM Saat Ini</FieldLabel>
                <TextField value={expenseKm} onChangeText={setExpenseKm} keyboardType="numeric" placeholder="Contoh: 12500" />
              </>
            ) : null}
            <FieldLabel required>Jumlah (Rp)</FieldLabel>
            <TextField value={nominal} onChangeText={setNominal} keyboardType="numeric" placeholder="Contoh: 50000" />
            <FieldLabel>Deskripsi (opsional)</FieldLabel>
            <TextField
              value={deskripsi}
              onChangeText={setDeskripsi}
              placeholder="Catatan tambahan (opsional)"
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: "top" }}
            />
            <FieldLabel required>Foto Struk</FieldLabel>
            <PhotoPicker value={receiptPhoto} onChange={setReceiptPhoto} onPressPreview={setLightboxUri} />
            <PrimaryButton title="Simpan Pengeluaran" onPress={save} />
          </>
        ) : tipe === "kendala" ? (
          <>
            <FieldLabel>ID Pengiriman (opsional)</FieldLabel>
            <SelectField value={resiId} options={resiOptions} placeholder="Pilih ID pengiriman..." onChange={setResiId} />
            <FieldLabel required>Jenis Kendala</FieldLabel>
            <View style={{ gap: 8, marginTop: 8 }}>
              {KENDALA_TYPES.map((t) => (
                <OptionItem key={t.id} label={t.label} selected={jenisKendala === t.id} onPress={() => setJenisKendala(t.id)} />
              ))}
            </View>
            <FieldLabel>Deskripsi (opsional)</FieldLabel>
            <TextField
              value={deskripsi}
              onChangeText={setDeskripsi}
              placeholder="Jelaskan kendala yang dihadapi secara detail..."
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: "top" }}
            />
            <FieldLabel required>Foto</FieldLabel>
            <PhotoPicker value={activityPhoto} onChange={setActivityPhoto} onPressPreview={setLightboxUri} />
            <PrimaryButton title="Kirim Laporan ke Admin" onPress={save} />
          </>
        ) : (
          <>
            <FieldLabel required>Deskripsi</FieldLabel>
            <TextField
              value={deskripsi}
              onChangeText={setDeskripsi}
              placeholder="Contoh: Cuci kendaraan di cucian langganan"
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: "top" }}
            />
            <FieldLabel required>Foto</FieldLabel>
            <PhotoPicker value={activityPhoto} onChange={setActivityPhoto} onPressPreview={setLightboxUri} />
            <PrimaryButton title="Simpan" onPress={save} />
          </>
        )}
      </BottomSheet>

      <BottomSheet
        visible={!!detailItem}
        onClose={() => setDetailItem(null)}
        title={detailItem ? activityTypeMeta(detailItem._tipe).label : ""}
      >
        {detailItem ? (
          <>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 14 }}>{formatTimeWIB(detailItem.createdAt)}</Text>
            {detailFields.map((f, idx) => (
              <View key={idx} style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: fontFamily.bold, letterSpacing: 0.3, marginBottom: 3 }}>
                  {f.label}
                </Text>
                <Text style={{ fontSize: 15, color: colors.text, fontFamily: fontFamily.semiBold }}>{f.value}</Text>
              </View>
            ))}
            {detailPhoto ? (
              <TouchableOpacity onPress={() => setLightboxUri(detailPhoto)} activeOpacity={0.9} style={{ marginBottom: 14 }}>
                <Image source={{ uri: detailPhoto }} style={{ width: "100%", height: 180, borderRadius: radius.sm }} />
              </TouchableOpacity>
            ) : null}
          </>
        ) : null}
      </BottomSheet>

      <DateRangeSheet
        visible={dateSheetOpen}
        onClose={() => setDateSheetOpen(false)}
        start={filterStart}
        end={filterEnd}
        allowAll
        onSelectAll={() => {
          setFilterStart(null);
          setFilterEnd(null);
        }}
        onApply={(s, e) => {
          setFilterStart(s);
          setFilterEnd(e);
        }}
      />

      <Lightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </SafeAreaView>
  );
}

function ActivityRow({ item, colors, deliveries, vehicleLabel, onPress }) {
  const meta = activityTypeMeta(item._tipe);
  let title, sub, right;

  let rowIcon = meta.icon;
  if (item._tipe === "pengeluaran") {
    // Item dari ERP nggak punya field "kategori" (cuma teks deskripsi gabungan) -- jangan
    // tampilkan "Lainnya" (fallback categoryMeta) yg bikin bingung, pakai label umum aja.
    if (item.fromErp) {
      rowIcon = meta.icon;
      title = meta.label;
    } else {
      const cat = categoryMeta(item.kategori);
      rowIcon = cat.icon;
      title = cat.label;
    }
    sub = item.keterangan || item.deskripsi;
    right = (
      <Text style={{ color: colors.red, fontFamily: fontFamily.extraBold, fontSize: 14 }}>-{formatRupiah(item.nominal)}</Text>
    );
  } else if (item._tipe === "kendala") {
    const related = item.relatedDeliveryId ? deliveries.find((d) => d.id === item.relatedDeliveryId) : null;
    title = item.jenisKendala ? kendalaTypeLabel(item.jenisKendala) : meta.label;
    sub = [related && related.noResi, vehicleLabel(item.kendaraan), item.deskripsi].filter(Boolean).join(" · ");
  } else {
    title = meta.label;
    sub = [vehicleLabel(item.kendaraan), item.deskripsi].filter(Boolean).join(" · ");
  }

  return (
    <View style={[styles.row, { backgroundColor: colors.card }]}>
      <TouchableOpacity style={[styles.rowIcon, { backgroundColor: colors.indigoSoft }]} activeOpacity={0.7} onPress={onPress}>
        <AppIcon {...rowIcon} size={19} color={colors.indigo} />
      </TouchableOpacity>
      <TouchableOpacity style={{ flex: 1, minWidth: 0 }} activeOpacity={0.7} onPress={onPress}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{formatTimeWIB(item.createdAt)}</Text>
        {sub ? (
          <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
        {!item.erpName ? (
          <View style={styles.pendingBadge}>
            <AppIcon name="time-outline" size={10} color="#d97706" />
            <Text style={styles.pendingBadgeText}>Menunggu dikirim</Text>
          </View>
        ) : null}
      </TouchableOpacity>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 140 },
  hero: { borderRadius: radius.lg, padding: 20, marginBottom: 16 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroTitle: { color: "#fff", fontSize: 17, fontFamily: fontFamily.extraBold },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  summary: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: radius.sm,
    padding: 14,
  },
  summaryLabel: { color: "#fff", fontSize: 12, opacity: 0.85, fontFamily: fontFamily.semiBold },
  summaryValue: { color: "#fff", fontSize: 26, fontFamily: fontFamily.extraBold, marginTop: 4 },
  filterHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 15.5, fontFamily: fontFamily.bold, flexShrink: 1, marginRight: 8 },
  filterPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, flexShrink: 0 },
  filterPillText: { fontSize: 12.5, fontFamily: fontFamily.bold },
  typeFilterRow: { marginBottom: 14 },
  emptyText: { fontSize: 14, textAlign: "center", paddingVertical: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, padding: 14 },
  rowIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 14, fontFamily: fontFamily.bold },
  rowSub: { fontSize: 12, marginTop: 2 },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#fef3c7",
  },
  pendingBadgeText: { fontSize: 10, fontFamily: fontFamily.bold, color: "#d97706" },
  tipeRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  tipeChip: { flex: 1, justifyContent: "center", paddingHorizontal: 4 },
  tipeChipText: { fontSize: 11.5 },
});
