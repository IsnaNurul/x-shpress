import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import AppIcon from "./AppIcon";
import { fontFamily, radius } from "../theme";

// Popup status (sukses/gagal) di TENGAH layar -- dipanggil dari mana saja (termasuk AppContext.js,
// yg bukan komponen React) lewat showStatusPopup({type, title, message}). Beda dari toast biasa
// (yg nempel di tepi layar), ini sengaja simpel: ikon bulat + judul + keterangan singkat, auto
// hilang sendiri, atau bisa di-tap buat nutup lebih cepat.
let showFn = null;

export function showStatusPopup({ type = "success", title, message }) {
  if (showFn) showFn({ type, title, message });
}

export default function StatusPopup() {
  const [state, setState] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    showFn = (payload) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setState(payload);
      timerRef.current = setTimeout(() => setState(null), 1800);
    };
    return () => {
      showFn = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!state) return null;
  const iconSpec =
    state.type === "error"
      ? { bg: "#fee2e2", color: "#dc2626", icon: "close" }
      : state.type === "warning"
      ? { bg: "#fef3c7", color: "#d97706", icon: "time-outline" }
      : { bg: "#dcfce7", color: "#16a34a", icon: "checkmark" };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setState(null)}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setState(null)}>
        <View style={styles.card}>
          <View style={[styles.iconCircle, { backgroundColor: iconSpec.bg }]}>
            <AppIcon name={iconSpec.icon} size={24} color={iconSpec.color} />
          </View>
          <Text style={styles.title}>{state.title}</Text>
          {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,10,30,0.25)" },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    paddingVertical: 22,
    paddingHorizontal: 26,
    alignItems: "center",
    minWidth: 170,
    maxWidth: 240,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  title: { fontSize: 15, fontFamily: fontFamily.extraBold, color: "#1c1a27", textAlign: "center" },
  message: { fontSize: 12, fontFamily: fontFamily.medium, color: "#6b6280", textAlign: "center", marginTop: 3 },
});
