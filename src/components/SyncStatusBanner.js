import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context/AppContext";
import AppIcon from "./AppIcon";
import { fontFamily } from "../theme";

// Banner tipis nempel di atas (nimpa layar apa pun yg lagi aktif) -- CUMA muncul kalau ada yg
// perlu diomongin ke driver (offline, atau masih ada data yg nunggu dikirim), jadi nggak makan
// tempat terus-terusan pas semuanya normal.
export default function SyncStatusBanner() {
  const { isOnline, pendingSyncCount } = useApp();
  const insets = useSafeAreaInsets();

  if (isOnline && pendingSyncCount === 0) return null;

  const offline = !isOnline;
  const message = offline
    ? pendingSyncCount > 0
      ? `Tidak ada koneksi internet · ${pendingSyncCount} data menunggu dikirim`
      : "Tidak ada koneksi internet"
    : `Mengirim ${pendingSyncCount} data yang tertunda...`;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        { paddingTop: insets.top + 8, backgroundColor: offline ? "#dc2626" : "#d97706" },
      ]}
    >
      <AppIcon name={offline ? "cloud-offline-outline" : "sync-outline"} size={14} color="#fff" />
      <Text style={styles.text} numberOfLines={1}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingBottom: 8,
    paddingHorizontal: 16,
    zIndex: 999,
    elevation: 999,
  },
  text: { color: "#fff", fontSize: 12, fontFamily: fontFamily.bold },
});
