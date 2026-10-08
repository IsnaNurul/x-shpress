import React, { useMemo, useState } from "react";
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import { useApp } from "../context/AppContext";
import { Badge, Chip } from "../components/ui";
import DateRangeSheet from "../components/DateRangeSheet";
import Lightbox from "../components/Lightbox";
import AppIcon from "../components/AppIcon";
import { formatDateRangeLabel, todayISO } from "../utils/format";
import { statusLabel, statusKey } from "../data/constants";

const FILTERS = [
  { id: "semua", label: "Semua" },
  { id: "ditugaskan", label: "Ditugaskan" },
  { id: "dalam_perjalanan", label: "Dikirim" },
  { id: "terkirim", label: "Selesai" },
  { id: "gagal", label: "Gagal" },
];

export default function DeliveriesScreen({ navigation }) {
  const { colors } = useAppTheme();
  const { deliveries, deliveriesLoading, deliveriesError, refreshDeliveries, outletName } = useApp();
  const [lightboxUri, setLightboxUri] = useState(null);
  const [filter, setFilter] = useState("semua");

  const [filterStart, setFilterStart] = useState(todayISO());
  const [filterEnd, setFilterEnd] = useState(todayISO());
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={deliveriesLoading} onRefresh={() => refreshDeliveries()} tintColor={colors.purple2} />}
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
            <Text style={styles.summaryLabel}>Total Paket Ditugaskan</Text>
            <Text style={styles.summaryValue}>{todays.length}</Text>
            {breakdown.length > 0 ? (
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

                {item.outlet ? (
                  <View style={styles.rowLine}>
                    <AppIcon name="storefront-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.rowLineText, { color: colors.textMuted }]} numberOfLines={1}>{outletName(item.outlet)}</Text>
                  </View>
                ) : null}
                <View style={styles.rowLine}>
                  <AppIcon name="location-outline" size={14} color={colors.textMuted} />
                  <Text style={[styles.rowLineText, { color: colors.textMuted }]} numberOfLines={1}>{item.alamat}</Text>
                </View>
                {item.itemName ? (
                  <View style={styles.rowLine}>
                    <AppIcon name="cube-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.rowLineText, { color: colors.textMuted }]} numberOfLines={1}>
                      {item.itemName}{item.qty ? ` · ${item.qty} pcs` : ""}
                    </Text>
                  </View>
                ) : null}

                {item.proofPhoto ? (
                  <TouchableOpacity onPress={() => setLightboxUri(item.proofPhoto)} style={{ marginTop: 8 }}>
                    <Image source={{ uri: item.proofPhoto }} style={styles.thumb} />
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
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

      <Lightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </SafeAreaView>
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
  filterHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 15.5, fontFamily: fontFamily.bold, flexShrink: 1, marginRight: 8 },
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
  thumb: { width: 60, height: 60, borderRadius: 10 },
});
