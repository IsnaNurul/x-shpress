import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import { useApp } from "../context/AppContext";
import { FieldLabel, TextField, PrimaryButton, SecondaryButton, Chip, OptionItem } from "../components/ui";
import BottomSheet from "../components/BottomSheet";
import PhotoPicker from "../components/PhotoPicker";
import Lightbox from "../components/Lightbox";
import SelectField from "../components/SelectField";
import DateRangeSheet from "../components/DateRangeSheet";
import DropdownMenu from "../components/DropdownMenu";
import { showConfirmPopup } from "../components/ConfirmPopup";
import AppIcon from "../components/AppIcon";
import { formatRupiah, formatTimeWIB, formatDateRangeLabel, todayISO, deliveryPickLabel, deliveryPickSublabel } from "../utils/format";
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
    deleteExpense,
    updateExpense,
    addKendala,
    deleteKendala,
    deletePengecekan,
    addCuciKendaraan,
    deleteCuciKendaraan,
    activitiesLoading,
    refreshActivities,
    vehicles,
    vehicleLabel,
    todaysKendaraan,
    refreshTodaysKendaraan,
  } = useApp();

  const todaysDeliveries = useMemo(() => deliveries.filter((d) => d.date === todayISO()), [deliveries]);

  const kategoriOptions = useMemo(() => EXPENSE_CATEGORIES.map((c) => ({ label: c.label, value: c.id })), []);
  const vehicleOptions = useMemo(
    () =>
      vehicles.map((v) => ({
        label: [v.plate_number, v.vehicle_type, v.brand].filter(Boolean).join(" · "),
        value: v.plate_number,
      })),
    [vehicles]
  );

  // Tarik sekali tiap buka halaman ini, buat pulihkan aktivitas yg sudah tersimpan di ERP tapi
  // copy lokalnya hilang (mis. abis Kosongkan Data Lokal versi lama, ganti HP, dll). Kendaraan hari
  // ini juga dicek ulang LANGSUNG ke ERP (bukan nebak dari array lokal `pengecekan`) tiap halaman
  // ini dibuka, biar default kendaraan di form Aktivitas (editable, lihat state `kendaraan`) akurat.
  useEffect(() => {
    refreshActivities();
    refreshTodaysKendaraan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [tipe, setTipe] = useState("pengeluaran");
  const [kendaraan, setKendaraan] = useState("");
  const [kategori, setKategori] = useState(EXPENSE_CATEGORIES[0].id);
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [receiptPhoto, setReceiptPhoto] = useState(null);
  const [jenisKendala, setJenisKendala] = useState(KENDALA_TYPES[0].id);
  const [resiId, setResiId] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [activityPhoto, setActivityPhoto] = useState(null);
  const [lightboxUri, setLightboxUri] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [actionMenu, setActionMenu] = useState(null); // { items, anchorY }

  function openRowActionMenu(opts, anchorY) {
    const items = buildRowActionItems(opts);
    if (items.length === 0) return;
    setActionMenu({ items, anchorY });
  }

  // Rincian lengkap item yg lagi dibuka di sheet detail -- field-nya beda2 per tipe aktivitas.
  const detailFields = useMemo(() => {
    if (!detailItem) return [];
    const item = detailItem;
    if (item._tipe === "pengeluaran") {
      const cat = item.fromErp ? null : categoryMeta(item.kategori);
      return [
        cat ? { label: "Kategori", value: cat.label } : null,
        { label: "Jumlah", value: formatRupiah(item.nominal) },
        item.keterangan || item.deskripsi ? { label: "Keterangan", value: item.keterangan || item.deskripsi } : null,
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
    setNominal("");
    setKeterangan("");
    setReceiptPhoto(null);
    setJenisKendala(KENDALA_TYPES[0].id);
    setResiId("");
    setDeskripsi("");
    setActivityPhoto(null);
  }

  function openAddModal() {
    setEditingExpenseId(null);
    resetForm("pengeluaran");
    setModalOpen(true);
    refreshTodaysKendaraan(); // pastikan default kendaraan di form sesuai ERP terbaru
  }

  function openEditExpense(item) {
    setEditingExpenseId(item.id);
    setTipe("pengeluaran");
    setKendaraan(item.kendaraan || todaysKendaraan || "");
    setKategori(item.kategori);
    setNominal(String(item.nominal || ""));
    setKeterangan(item.keterangan || "");
    setReceiptPhoto(item.receiptPhoto || null);
    setModalOpen(true);
  }

  function save() {
    if (!kendaraan) {
      Alert.alert("Lengkapi data", "Kendaraan wajib dipilih.");
      return;
    }
    if (tipe === "pengeluaran") {
      const nominalNum = Number(nominal);
      if (!keterangan.trim() || !nominalNum || nominalNum <= 0) {
        Alert.alert("Lengkapi data", "Keterangan dan jumlah pengeluaran wajib diisi dengan benar.");
        return;
      }
      if (!receiptPhoto) {
        Alert.alert("Lengkapi data", "Foto struk wajib diisi.");
        return;
      }
      if (editingExpenseId) {
        updateExpense(editingExpenseId, { kategori, keterangan: keterangan.trim(), nominal: nominalNum, receiptPhoto, kendaraan });
      } else {
        addExpense({ date: todayISO(), kategori, keterangan: keterangan.trim(), nominal: nominalNum, receiptPhoto, kendaraan });
      }
    } else if (tipe === "kendala") {
      if (!activityPhoto) {
        Alert.alert("Lengkapi data", "Foto wajib diisi.");
        return;
      }
      addKendala({
        date: todayISO(),
        jenisKendala,
        deskripsi: deskripsi.trim(),
        relatedDeliveryId: resiId || null,
        kendaraan,
        foto: activityPhoto,
      });
    } else {
      if (!deskripsi.trim()) {
        Alert.alert("Lengkapi data", "Deskripsi wajib diisi.");
        return;
      }
      if (!activityPhoto) {
        Alert.alert("Lengkapi data", "Foto wajib diisi.");
        return;
      }
      addCuciKendaraan({ date: todayISO(), kendaraan, deskripsi: deskripsi.trim(), foto: activityPhoto });
    }
    setFilterStart(todayISO());
    setFilterEnd(todayISO());
    setModalOpen(false);
  }

  function confirmDelete(item) {
    showConfirmPopup({
      title: "Hapus Aktivitas",
      message: "Hapus catatan ini? Aksi ini tidak bisa dibatalkan.",
      confirmText: "Hapus",
      danger: true,
      onConfirm: () => {
        if (item._tipe === "pengeluaran") deleteExpense(item.id);
        else if (item._tipe === "kendala") deleteKendala(item.id);
        else if (item._tipe === "pengecekan") deletePengecekan(item.id);
        else deleteCuciKendaraan(item.id);
      },
    });
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
                onEdit={item._tipe === "pengeluaran" && !item.fromErp && item.date === todayISO() ? () => openEditExpense(item) : null}
                onDelete={!item.fromErp && item.date === todayISO() ? () => confirmDelete(item) : null}
                onViewPhoto={setLightboxUri}
                onShowActions={openRowActionMenu}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <BottomSheet visible={modalOpen} onClose={() => setModalOpen(false)} title={editingExpenseId ? "Edit Pengeluaran" : "Catat Aktivitas"}>
        {!editingExpenseId ? (
          <>
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
          </>
        ) : null}

        <FieldLabel required>Kendaraan</FieldLabel>
        <SelectField value={kendaraan} options={vehicleOptions} placeholder="Pilih kendaraan..." onChange={setKendaraan} />

        {tipe === "pengeluaran" ? (
          <>
            <FieldLabel>Kategori</FieldLabel>
            <SelectField value={kategori} options={kategoriOptions} placeholder="Pilih kategori..." onChange={setKategori} />
            <FieldLabel required>Jumlah (Rp)</FieldLabel>
            <TextField value={nominal} onChangeText={setNominal} keyboardType="numeric" placeholder="Contoh: 50000" />
            <FieldLabel required>Keterangan</FieldLabel>
            <TextField value={keterangan} onChangeText={setKeterangan} placeholder="Contoh: Isi bensin full" />
            <FieldLabel required>Foto Struk</FieldLabel>
            <PhotoPicker value={receiptPhoto} onChange={setReceiptPhoto} onPressPreview={setLightboxUri} />
            <PrimaryButton title={editingExpenseId ? "Simpan Perubahan" : "Simpan Pengeluaran"} onPress={save} />
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
            <FieldLabel>Deskripsi Kendala (opsional)</FieldLabel>
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
            {!detailItem.fromErp && detailItem.date === todayISO() ? (
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                {detailItem._tipe === "pengeluaran" ? (
                  <PrimaryButton
                    title="Edit"
                    icon={{ name: "create-outline" }}
                    style={{ flex: 1, marginTop: 0 }}
                    onPress={() => {
                      const item = detailItem;
                      setDetailItem(null);
                      openEditExpense(item);
                    }}
                  />
                ) : null}
                <SecondaryButton
                  title="Hapus"
                  danger
                  onPress={() => {
                    const item = detailItem;
                    setDetailItem(null);
                    confirmDelete(item);
                  }}
                />
              </View>
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

      <DropdownMenu
        visible={!!actionMenu}
        onClose={() => setActionMenu(null)}
        anchorY={actionMenu?.anchorY}
        items={actionMenu?.items || []}
      />
    </SafeAreaView>
  );
}

function ActivityRow({ item, colors, deliveries, vehicleLabel, onPress, onEdit, onDelete, onViewPhoto, onShowActions }) {
  const meta = activityTypeMeta(item._tipe);
  let title, sub, right, photo;

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
    photo = item.receiptPhoto || item.foto;
  } else if (item._tipe === "kendala") {
    const related = item.relatedDeliveryId ? deliveries.find((d) => d.id === item.relatedDeliveryId) : null;
    title = item.jenisKendala ? kendalaTypeLabel(item.jenisKendala) : meta.label;
    sub = [related && related.noResi, vehicleLabel(item.kendaraan), item.deskripsi].filter(Boolean).join(" · ");
    photo = item.foto;
  } else {
    title = meta.label;
    sub = [vehicleLabel(item.kendaraan), item.deskripsi].filter(Boolean).join(" · ");
    photo = item.foto;
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
      </TouchableOpacity>
      {right}
      {onEdit || onDelete ? (
        <TouchableOpacity
          onPress={(e) => onShowActions({ photo, onEdit, onDelete, onViewPhoto }, e.nativeEvent.pageY)}
          style={styles.rowIconBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <AppIcon name="ellipsis-vertical" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// Daftar item menu (Lihat Foto / Edit / Hapus) buat DropdownMenu -- cuma dipanggil kalau tombol
// titik tiga muncul (berarti item hari ini & bukan dari ERP), jadi di sini nggak perlu cek ulang
// boleh-tidaknya.
function buildRowActionItems({ photo, onEdit, onDelete, onViewPhoto }) {
  const items = [];
  if (photo) items.push({ label: "Lihat Foto", icon: "image-outline", onPress: () => onViewPhoto(photo) });
  if (onEdit) items.push({ label: "Edit", icon: "create-outline", onPress: onEdit });
  if (onDelete) items.push({ label: "Hapus", icon: "trash-outline", danger: true, onPress: onDelete });
  return items;
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
  rowIconBtn: { paddingLeft: 4, paddingVertical: 4 },
  tipeRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  tipeChip: { flex: 1, justifyContent: "center", paddingHorizontal: 4 },
  tipeChipText: { fontSize: 11.5 },
});
