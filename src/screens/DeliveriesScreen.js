import React, { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import { useApp } from "../context/AppContext";
import { Badge, Chip, PrimaryButton } from "../components/ui";
import DateRangeSheet from "../components/DateRangeSheet";
import AppIcon from "../components/AppIcon";
import { showConfirmPopup } from "../components/ConfirmPopup";
import { showStatusPopup } from "../components/StatusPopup";
import { formatDateRangeLabel, todayISO, shiftDateISO } from "../utils/format";
import { statusLabel, statusKey } from "../data/constants";

// "Ditugaskan" sengaja nggak ada di sini -- status itu sekarang cuma nampung di "Pesanan
// Tersedia" (lihat refreshAvailableDeliveries di AppContext.js), nggak pernah masuk "Tugas Saya".
const FILTERS = [
  { id: "semua", label: "Semua" },
  { id: "dalam_perjalanan", label: "Dikirim" },
  { id: "terkirim", label: "Selesai" },
  { id: "gagal", label: "Gagal" },
];

export default function DeliveriesScreen({ navigation }) {
  const { colors } = useAppTheme();
  const {
    deliveries,
    deliveriesLoading,
    deliveriesError,
    refreshDeliveries,
    availableDeliveries,
    availableDeliveriesLoading,
    refreshAvailableDeliveries,
    sendDelivery,
    outletName,
    pendingDeliveryIds,
  } = useApp();
  const [filter, setFilter] = useState("semua");
  const [view, setView] = useState("tugas"); // "tugas" | "tersedia"
  const [sendingId, setSendingId] = useState(null);

  // Default 3 hari terakhir (bukan cuma "Hari Ini") -- jaga-jaga pesanan yg dibuat admin beberapa
  // hari lalu tapi BARU ditugaskan belakangan (lihat `date` di mapDelivery.js, basisnya tanggal
  // `creation`, bukan tanggal ditugaskan). Filter tetap bisa dipersempit manual kapan aja lewat
  // DateRangeSheet -- ini cuma defaultnya doang yg dilebarin.
  const [filterStart, setFilterStart] = useState(shiftDateISO(todayISO(), -2));
  const [filterEnd, setFilterEnd] = useState(todayISO());
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  // Refresh tiap tab ini difokus -- dua-duanya (tugas sendiri & pesanan tersedia) sekalian ditarik
  // bareng, biar badge jumlah "Pesanan Tersedia" di toggle selalu akurat meski lagi di sub-tab lain.
  useFocusEffect(
    useCallback(() => {
      refreshDeliveries();
      refreshAvailableDeliveries();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const todays = useMemo(
    () => (filterStart ? deliveries.filter((d) => d.date >= filterStart && d.date <= filterEnd) : deliveries.slice()),
    [deliveries, filterStart, filterEnd]
  );
  const filtered = useMemo(
    () => (filter === "semua" ? todays : todays.filter((d) => d.status === filter)),
    [todays, filter]
  );
  const countFor = (id) => (id === "semua" ? todays.length : todays.filter((d) => d.status === id).length);

  const breakdown = useMemo(
    () => FILTERS.filter((f) => f.id !== "semua" && countFor(f.id) > 0),
    [todays]
  );

  const availableFiltered = useMemo(
    () =>
      filterStart
        ? availableDeliveries.filter((d) => d.date >= filterStart && d.date <= filterEnd)
        : availableDeliveries.slice(),
    [availableDeliveries, filterStart, filterEnd]
  );

  function handleSend(item) {
    showConfirmPopup({
      title: "Kirim Pesanan Ini?",
      message: `Pesanan ${item.penerima} akan ditandai "Dalam Perjalanan" dan masuk ke daftar "Tugas Saya".`,
      confirmText: "Ya, Kirim",
      onConfirm: async () => {
        setSendingId(item.id);
        const result = await sendDelivery(item.id);
        setSendingId(null);
        if (result.success) {
          showStatusPopup({ type: "success", title: "Berhasil", message: "Pesanan sudah dikirim." });
        } else {
          showStatusPopup({ type: "error", title: "Gagal", message: result.message || "Gagal mengirim pesanan." });
          refreshAvailableDeliveries();
        }
      },
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={view === "tugas" ? deliveriesLoading : availableDeliveriesLoading}
            onRefresh={() => {
              refreshDeliveries();
              refreshAvailableDeliveries();
            }}
            tintColor={colors.purple2}
          />
        }
      >
        {deliveriesError ? (
          <View style={[styles.warnBanner, { backgroundColor: colors.redSoft }]}>
            <AppIcon name="cloud-offline-outline" size={16} color={colors.red} />
            <Text style={{ color: colors.red, fontSize: 12.5, fontFamily: fontFamily.bold, flex: 1 }}>{deliveriesError}</Text>
          </View>
        ) : null}
        <View style={[styles.hero, { backgroundColor: colors.purple2 }]}>
          <View style={styles.heroTop}>
            <Text style={styles.heroTitle}>Pengiriman</Text>
          </View>
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>{view === "tugas" ? "Total Paket Ditugaskan" : "Pesanan Tersedia Diambil"}</Text>
            <Text style={styles.summaryValue}>{view === "tugas" ? todays.length : availableFiltered.length}</Text>
            {view === "tugas" && breakdown.length > 0 ? (
              <View style={styles.breakdownRow}>
                {breakdown.map((f) => (
                  <View key={f.id} style={styles.breakdownItem}>
                    <View style={[styles.breakdownDot, { backgroundColor: colors[statusKey(f.id)] }]} />
                    <Text style={styles.breakdownChip}>{countFor(f.id)} {f.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            onPress={() => setView("tugas")}
            style={[styles.toggleBtn, { backgroundColor: view === "tugas" ? colors.purple2 : colors.card }]}
          >
            <Text style={[styles.toggleBtnText, { color: view === "tugas" ? "#fff" : colors.textMuted }]}>Tugas Saya</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setView("tersedia")}
            style={[styles.toggleBtn, { backgroundColor: view === "tersedia" ? colors.purple2 : colors.card }]}
          >
            <Text style={[styles.toggleBtnText, { color: view === "tersedia" ? "#fff" : colors.textMuted }]} numberOfLines={1}>
              Pesanan Tersedia{availableFiltered.length > 0 ? ` (${availableFiltered.length})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        {view === "tugas" ? (
          <>
            <View style={styles.filterHeadRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Daftar Pengiriman</Text>
              <TouchableOpacity onPress={() => setDateSheetOpen(true)} style={[styles.filterPill, { backgroundColor: colors.blueSoft }]}>
                <AppIcon name="calendar-outline" size={13} color={colors.purple2} />
                <Text style={[styles.filterPillText, { color: colors.purple2 }]}>{formatDateRangeLabel(filterStart, filterEnd)}</Text>
                <AppIcon name="chevron-down" size={13} color={colors.purple2} />
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusFilterRow} contentContainerStyle={{ gap: 8 }}>
              {FILTERS.map((f) => (
                <Chip key={f.id} label={`${f.label} (${countFor(f.id)})`} selected={filter === f.id} onPress={() => setFilter(f.id)} />
              ))}
            </ScrollView>

            {filtered.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {filterStart ? "Tidak ada pengiriman untuk filter ini." : "Belum ada pengiriman."}
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                {filtered.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.row, { backgroundColor: colors.card }]}
                    onPress={() => navigation.navigate("DeliveryDetail", { id: item.id })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.rowTop}>
                      <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>{item.penerima}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Badge label={statusLabel(item.status)} colorKey={statusKey(item.status)} />
                        <AppIcon name="chevron-forward" size={16} color={colors.textMuted} />
                      </View>
                    </View>

                    {item.noResi ? <Text style={[styles.resiText, { color: colors.indigo }]}>{item.noResi}</Text> : null}

                    {pendingDeliveryIds.has(item.id) ? (
                      <View style={styles.pendingBadge}>
                        <AppIcon name="time-outline" size={10} color="#d97706" />
                        <Text style={styles.pendingBadgeText}>Menunggu dikirim ke server</Text>
                      </View>
                    ) : null}

                    {item.outlet ? (
                      <View style={styles.rowLine}>
                        <AppIcon name="storefront-outline" size={14} color={colors.textMuted} />
                        <Text style={[styles.rowLineText, { color: colors.textMuted }]} numberOfLines={1}>{outletName(item.outlet)}</Text>
                      </View>
                    ) : null}
                    <AlamatLine item={item} colors={colors} />
                    {item.itemName ? (
                      <View style={styles.rowLine}>
                        <AppIcon name="cube-outline" size={14} color={colors.textMuted} />
                        <Text style={[styles.rowLineText, { color: colors.textMuted }]} numberOfLines={1}>
                          {item.itemName}{item.qty ? ` · ${item.qty} pcs` : ""}
                        </Text>
                      </View>
                    ) : null}
                    <MapsButton item={item} colors={colors} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.filterHeadRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Pesanan Tersedia</Text>
              <TouchableOpacity onPress={() => setDateSheetOpen(true)} style={[styles.filterPill, { backgroundColor: colors.blueSoft }]}>
                <AppIcon name="calendar-outline" size={13} color={colors.purple2} />
                <Text style={[styles.filterPillText, { color: colors.purple2 }]}>{formatDateRangeLabel(filterStart, filterEnd)}</Text>
                <AppIcon name="chevron-down" size={13} color={colors.purple2} />
              </TouchableOpacity>
            </View>

            {availableFiltered.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {filterStart ? "Tidak ada pesanan tersedia untuk filter ini." : "Belum ada pesanan tersedia saat ini."}
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                {availableFiltered.map((item) => (
                  <View key={item.id} style={[styles.row, { backgroundColor: colors.card }]}>
                    <View style={styles.rowTop}>
                      <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>{item.penerima}</Text>
                      <Badge label="Ditugaskan" colorKey="orange" />
                    </View>

                    {item.outlet ? (
                      <View style={styles.rowLine}>
                        <AppIcon name="storefront-outline" size={14} color={colors.textMuted} />
                        <Text style={[styles.rowLineText, { color: colors.textMuted }]} numberOfLines={1}>{outletName(item.outlet)}</Text>
                      </View>
                    ) : null}
                    <AlamatLine item={item} colors={colors} />
                    {item.itemName ? (
                      <View style={styles.rowLine}>
                        <AppIcon name="cube-outline" size={14} color={colors.textMuted} />
                        <Text style={[styles.rowLineText, { color: colors.textMuted }]} numberOfLines={1}>
                          {item.itemName}{item.qty ? ` · ${item.qty} pcs` : ""}
                        </Text>
                      </View>
                    ) : null}
                    {item.vehicleType ? (
                      <View style={styles.rowLine}>
                        <AppIcon name="bicycle-outline" size={14} color={colors.textMuted} />
                        <Text style={[styles.rowLineText, { color: colors.textMuted }]} numberOfLines={1}>
                          Disarankan: {item.vehicleType}
                        </Text>
                      </View>
                    ) : null}

                    <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                      {item.latitude && item.longitude ? (
                        <TouchableOpacity
                          onPress={() => Linking.openURL(`https://www.google.com/maps?q=${item.latitude},${item.longitude}`)}
                          style={[styles.sideBtn, { flex: 1, backgroundColor: colors.blueSoft }]}
                          activeOpacity={0.8}
                        >
                          <AppIcon name="navigate-outline" size={17} color={colors.purple2} />
                          <Text style={{ color: colors.purple2, fontFamily: fontFamily.bold, fontSize: 15 }}>Lihat Lokasi</Text>
                        </TouchableOpacity>
                      ) : null}
                      <PrimaryButton
                        title="Kirim Pesanan"
                        icon={{ name: "send-outline" }}
                        style={{ flex: 1, marginTop: 0 }}
                        disabled={sendingId === item.id}
                        onPress={() => handleSend(item)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

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
    </SafeAreaView>
  );
}

function AlamatLine({ item, colors }) {
  return (
    <View style={styles.rowLine}>
      <AppIcon name="location-outline" size={14} color={colors.textMuted} />
      <Text style={[styles.rowLineText, { color: colors.textMuted }]} numberOfLines={1}>{item.alamat}</Text>
    </View>
  );
}

// Tombol jelas (bukan cuma icon) langsung buka Google Maps ke titik alamat, kalau titiknya ada --
// dipakai di kartu list Tugas Saya & Pesanan Tersedia biar kurir nggak perlu buka detail dulu.
// TouchableOpacity sendiri di dalam row yg juga TouchableOpacity (buka detail) -- nested touchable
// di RN otomatis nangkep tap-nya sendiri, nggak ikut nge-trigger onPress parent-nya.
function MapsButton({ item, colors }) {
  if (!item.latitude || !item.longitude) return null;
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(`https://www.google.com/maps?q=${item.latitude},${item.longitude}`)}
      style={[styles.mapsBtn, { backgroundColor: colors.blueSoft }]}
      activeOpacity={0.8}
    >
      <AppIcon name="navigate-outline" size={15} color={colors.purple2} />
      <Text style={{ color: colors.purple2, fontFamily: fontFamily.bold, fontSize: 12.5 }}>Buka di Google Maps</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 140 },
  hero: { borderRadius: radius.lg, padding: 20, marginBottom: 16 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroTitle: { color: "#fff", fontSize: 17, fontFamily: fontFamily.extraBold },
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
  breakdownRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  breakdownItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  breakdownDot: { width: 8, height: 8, borderRadius: 4 },
  breakdownChip: { color: "#fff", fontSize: 12, fontFamily: fontFamily.bold, opacity: 0.95 },
  toggleRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  toggleBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  toggleBtnText: { fontSize: 13, fontFamily: fontFamily.bold },
  filterHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 15.5, fontFamily: fontFamily.bold, flexShrink: 1, marginRight: 8 },
  sectionSub: { fontSize: 12, marginBottom: 12, lineHeight: 17 },
  filterPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, flexShrink: 0 },
  filterPillText: { fontSize: 12.5, fontFamily: fontFamily.bold },
  statusFilterRow: { marginBottom: 14 },
  warnBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, padding: 14, marginBottom: 16 },
  emptyText: { fontSize: 14, textAlign: "center", paddingVertical: 20 },
  row: { borderRadius: radius.md, padding: 14 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 },
  rowTitle: { fontSize: 15, fontFamily: fontFamily.extraBold },
  resiText: { fontSize: 12, fontFamily: fontFamily.bold, marginTop: 1 },
  rowLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  rowLineText: { fontSize: 12.5, flex: 1 },
  mapsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.sm, paddingVertical: 10, marginTop: 8 },
  sideBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.sm, paddingVertical: 14 },
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
});
