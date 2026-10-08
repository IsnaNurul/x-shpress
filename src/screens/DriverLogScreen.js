import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import { useApp } from "../context/AppContext";
import DateRangeSheet from "../components/DateRangeSheet";
import Lightbox from "../components/Lightbox";
import AppIcon from "../components/AppIcon";
import { formatTimeWIB, formatDateShort, formatDateRangeLabel, todayISO } from "../utils/format";
import { computeDriverLogStats } from "../utils/driverLog";

const ENTRY_META = {
  mulai: { label: "Mulai", icon: { lib: "MaterialCommunityIcons", name: "flag-checkered" }, color: "indigo" },
  transit: { label: "Transit", icon: { name: "download-outline" }, color: "orange" },
  selesai: { label: "Selesai", icon: { name: "checkmark-circle-outline" }, color: "green" },
  selesai_hari: { label: "Selesai Hari Ini", icon: { name: "flag-outline" }, color: "indigo" },
};

export default function DriverLogScreen() {
  const { colors } = useAppTheme();
  const { deliveries, expenses, driverLogEntries, driverLogLoading, refreshDriverLog, outletName } = useApp();

  // Tarik sekali tiap buka halaman ini, buat pulihkan riwayat aksi yg sudah tersimpan di ERP
  // tapi copy lokalnya hilang (mis. abis Hapus Data Lokal, ganti HP, dll).
  useEffect(() => {
    refreshDriverLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filterStart, setFilterStart] = useState(todayISO());
  const [filterEnd, setFilterEnd] = useState(todayISO());
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [lightboxUri, setLightboxUri] = useState(null);
  const isRange = !!filterStart && filterStart !== filterEnd;

  const deliveriesInRange = useMemo(
    () => (filterStart ? deliveries.filter((d) => d.date >= filterStart && d.date <= filterEnd) : deliveries),
    [deliveries, filterStart, filterEnd]
  );
  const expensesInRange = useMemo(
    () => (filterStart ? expenses.filter((e) => e.date >= filterStart && e.date <= filterEnd) : expenses),
    [expenses, filterStart, filterEnd]
  );
  const entriesInRange = useMemo(() => {
    const list = filterStart ? driverLogEntries.filter((e) => e.date >= filterStart && e.date <= filterEnd) : driverLogEntries;
    return list.slice().sort((a, b) => b.createdAt - a.createdAt);
  }, [driverLogEntries, filterStart, filterEnd]);
  const stats = useMemo(
    () => computeDriverLogStats(deliveriesInRange, expensesInRange),
    [deliveriesInRange, expensesInRange]
  );

  const hasActivity = stats.totalDo > 0 || entriesInRange.length > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={driverLogLoading} onRefresh={refreshDriverLog} tintColor={colors.purple2} />}
      >
        <View style={[styles.hero, { backgroundColor: colors.purple2 }]}>
          <View style={styles.heroTop}>
            <Text style={styles.heroTitle}>Log Driver</Text>
            <TouchableOpacity onPress={() => setDateSheetOpen(true)} style={styles.dateBtn}>
              <AppIcon name="calendar-outline" size={13} color="#fff" />
              <Text style={styles.dateBtnText}>{formatDateRangeLabel(filterStart, filterEnd)}</Text>
              <AppIcon name="chevron-down" size={13} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.statRow}>
            <StatBlock label="Total DO" value={stats.totalDo} />
            <StatBlock label="Terkirim" value={stats.delivered} />
            <StatBlock label="Gagal" value={stats.failed} />
            <StatBlock label="Success Rate" value={`${stats.successRate}%`} />
          </View>
        </View>

        {!hasActivity ? (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            Belum ada aktivitas tercatat untuk periode ini.
          </Text>
        ) : (
          <>
            <Text style={[styles.sectionHead, { color: colors.text }]}>Riwayat Aksi</Text>
            {entriesInRange.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Belum ada aksi (Mulai/Transit/Selesai) tercatat.</Text>
            ) : (
              <View style={{ gap: 10 }}>
                {entriesInRange.map((e) => {
                  const meta = ENTRY_META[e.tipe] || ENTRY_META.mulai;
                  return (
                    <View key={e.id} style={[styles.entryRow, { backgroundColor: colors.card }]}>
                      <View style={[styles.entryIcon, { backgroundColor: colors[meta.color + "Soft"] }]}>
                        <AppIcon {...meta.icon} size={18} color={colors[meta.color]} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.entryTitle, { color: colors.text }]}>
                          {meta.label}{e.km != null ? ` — KM ${e.km}` : ""}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                          {isRange ? formatDateShort(e.date) + " · " : ""}{formatTimeWIB(e.createdAt)}{e.outlet ? ` · ${outletName(e.outlet)}` : ""}
                        </Text>
                        {e.catatan ? (
                          <Text style={[styles.entrySub, { color: colors.textMuted }]} numberOfLines={2}>{e.catatan}</Text>
                        ) : null}
                      </View>
                      {e.photo ? (
                        <TouchableOpacity onPress={() => setLightboxUri(e.photo)}>
                          <Image source={{ uri: e.photo }} style={styles.entryThumb} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={[styles.syncNote, { color: colors.textMuted }]}>
              Tiap aksi otomatis tersinkron sebagai 1 baris baru ke ERP (doctype Driver Log).
            </Text>
          </>
        )}
      </ScrollView>

      <DateRangeSheet
        visible={dateSheetOpen}
        onClose={() => setDateSheetOpen(false)}
        start={filterStart}
        end={filterEnd}
        onApply={(s, e) => {
          setFilterStart(s);
          setFilterEnd(e);
        }}
      />

      <Lightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </SafeAreaView>
  );
}

function StatBlock({ label, value }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 140 },
  hero: { borderRadius: radius.lg, padding: 20, marginBottom: 16 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroTitle: { color: "#fff", fontSize: 17, fontFamily: fontFamily.extraBold },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  dateBtnText: { color: "#fff", fontSize: 12.5, fontFamily: fontFamily.bold },
  statRow: { flexDirection: "row", marginTop: 18, gap: 8 },
  statBlock: { flex: 1, alignItems: "center" },
  statValue: { color: "#fff", fontSize: 20, fontFamily: fontFamily.extraBold },
  statLabel: { color: "#fff", fontSize: 10.5, opacity: 0.85, fontFamily: fontFamily.semiBold, marginTop: 2, textAlign: "center" },
  emptyText: { fontSize: 14, textAlign: "center", paddingVertical: 20 },
  sectionHead: { fontSize: 15.5, fontFamily: fontFamily.bold, marginTop: 4, marginBottom: 12 },
  entryRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, padding: 14 },
  entryIcon: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  entryTitle: { fontSize: 14, fontFamily: fontFamily.bold },
  entrySub: { fontSize: 12, marginTop: 3 },
  entryThumb: { width: 44, height: 44, borderRadius: 10 },
  syncNote: { fontSize: 11.5, textAlign: "center", paddingTop: 4, paddingBottom: 10 },
});
