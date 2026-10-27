import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, AppState, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { fontFamily, radius } from "../theme";
import AppIcon from "./AppIcon";

// Gate wajib izin lokasi -- diminta SEKALI di awal pas app dibuka (bukan pas driver mau
// submit Pengecekan/Transit/Selesai kayak sebelumnya), & app nggak bisa dipakai sama sekali
// (termasuk Login) sampai izinnya aktif. Dicek ulang tiap app balik ke foreground, krn izin
// bisa dicabut manual lewat Setting HP pas app lagi di background.
export default function LocationPermissionGate({ children }) {
  const [status, setStatus] = useState(null); // null = lagi cek, "granted" | "denied" | "blocked"
  const [requesting, setRequesting] = useState(false);

  const checkStatus = useCallback(async () => {
    const { status: s, canAskAgain } = await Location.getForegroundPermissionsAsync();
    setStatus(s === "granted" ? "granted" : canAskAgain ? "denied" : "blocked");
  }, []);

  useEffect(() => {
    checkStatus();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") checkStatus();
    });
    return () => sub.remove();
  }, [checkStatus]);

  async function handleEnable() {
    if (requesting) return;
    setRequesting(true);
    try {
      const { status: s, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      setStatus(s === "granted" ? "granted" : canAskAgain ? "denied" : "blocked");
    } finally {
      setRequesting(false);
    }
  }

  if (status === null || status === "granted") return <>{children}</>;

  const blocked = status === "blocked";

  return (
    <View style={{ flex: 1, backgroundColor: "#78008e" }}>
      <SafeAreaView style={styles.wrap}>
        <View style={styles.iconCircle}>
          <AppIcon name="location" size={38} color="#fff" />
        </View>
        <Text style={styles.title}>Izin Lokasi Dibutuhkan</Text>
        <Text style={styles.desc}>
          X-SHPRESS wajib mengaktifkan izin lokasi supaya setiap aksi pengiriman (Pengecekan,
          Transit, Selesai) tercatat lokasinya sebagai bukti laporan. Aktifkan izinnya dulu
          untuk lanjut pakai aplikasi.
        </Text>
        <TouchableOpacity
          onPress={blocked ? () => Linking.openSettings() : handleEnable}
          style={styles.btn}
          activeOpacity={0.85}
          disabled={requesting}
        >
          <AppIcon name={blocked ? "settings-outline" : "location"} size={18} color="#78008e" />
          <Text style={styles.btnText}>
            {requesting ? "Memproses..." : blocked ? "Buka Pengaturan" : "Aktifkan Izin Lokasi"}
          </Text>
        </TouchableOpacity>
        {blocked ? (
          <Text style={styles.hint}>Buka Pengaturan → Izin Aplikasi → Lokasi, lalu pilih "Izinkan".</Text>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  title: { color: "#fff", fontSize: 19, fontFamily: fontFamily.extraBold, marginBottom: 10, textAlign: "center" },
  desc: { color: "rgba(255,255,255,0.85)", fontSize: 13.5, fontFamily: fontFamily.medium, textAlign: "center", lineHeight: 20 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: radius.sm,
    paddingVertical: 14,
    paddingHorizontal: 26,
    marginTop: 26,
  },
  btnText: { color: "#78008e", fontSize: 14.5, fontFamily: fontFamily.bold },
  hint: { color: "rgba(255,255,255,0.7)", fontSize: 11.5, fontFamily: fontFamily.medium, textAlign: "center", marginTop: 14 },
});
