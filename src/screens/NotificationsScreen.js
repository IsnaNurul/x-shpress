import React, { useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import { useApp } from "../context/AppContext";
import AppIcon from "../components/AppIcon";
import { todayISO, formatTimestamp } from "../utils/format";

export default function NotificationsScreen({ navigation }) {
  const { colors } = useAppTheme();
  const { deliveries } = useApp();
  const today = todayISO();

  const notifications = useMemo(() => {
    return deliveries
      .filter((d) => d.date === today)
      .slice()
      .sort((a, b) => b.assignedAt - a.assignedAt)
      .map((d) => ({
        id: d.id,
        deliveryId: d.id,
        title: "Pengiriman baru ditugaskan",
        subtitle: `${d.penerima} · ${d.alamat}`,
        time: d.assignedAt,
      }));
  }, [deliveries, today]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.card }]}>
          <AppIcon name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topbarTitle, { color: colors.text }]}>Notifikasi</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {notifications.length === 0 ? (
          <View style={styles.emptyWrap}>
            <AppIcon name="notifications-off-outline" size={36} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Belum ada notifikasi hari ini.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {notifications.map((n) => (
              <TouchableOpacity
                key={n.id}
                activeOpacity={0.85}
                style={[styles.card, { backgroundColor: colors.card }]}
                onPress={() =>
                  navigation.getParent()?.navigate("Pengiriman", { screen: "DeliveryDetail", params: { id: n.deliveryId } })
                }
              >
                <View style={[styles.icon, { backgroundColor: colors.indigoSoft }]}>
                  <AppIcon name="cube-outline" size={19} color={colors.indigo} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{n.title}</Text>
                  <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={2}>{n.subtitle}</Text>
                  <Text style={[styles.time, { color: colors.textMuted }]}>{formatTimestamp(n.time)}</Text>
                </View>
                <AppIcon name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  topbarTitle: { fontSize: 18, fontFamily: fontFamily.extraBold },
  scroll: { padding: 16, paddingBottom: 140 },
  emptyWrap: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, padding: 14 },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontFamily: fontFamily.bold },
  subtitle: { fontSize: 12.5, marginTop: 2 },
  time: { fontSize: 11, marginTop: 4 },
});
