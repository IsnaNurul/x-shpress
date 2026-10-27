import React, { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import AppIcon from "./AppIcon";
import { fontFamily, radius } from "../theme";

// Popup konfirmasi (Ya/Batal) di TENGAH layar, tampilannya senada sama StatusPopup -- dipanggil
// dari mana saja lewat showConfirmPopup({title, message, confirmText, cancelText, danger, onConfirm}).
// Beda dari StatusPopup: ini BUKAN auto-hilang, harus pilih salah satu tombol (atau tap di luar
// kartu = sama kayak Batal). Kalau `hideCancel: true`, tombol Batal disembunyikan dan jadi
// popup 1-tombol (OK) -- tap di luar kartu/tombol back Android dianggap sama kayak nekan tombol
// itu juga (dipakai utk notifikasi yg HARUS di-acknowledge, mis. sesi login habis).
let showFn = null;

export function showConfirmPopup({
  title,
  message,
  confirmText = "Ya",
  cancelText = "Batal",
  danger = false,
  hideCancel = false,
  onConfirm,
  onCancel,
}) {
  if (showFn) showFn({ title, message, confirmText, cancelText, danger, hideCancel, onConfirm, onCancel });
}

export default function ConfirmPopup() {
  const [state, setState] = useState(null);

  useEffect(() => {
    showFn = (payload) => setState(payload);
    return () => {
      showFn = null;
    };
  }, []);

  if (!state) return null;

  function close(action) {
    const { onConfirm, onCancel, hideCancel } = state;
    setState(null);
    if (hideCancel) {
      // Satu2nya aksi -- apa pun cara nutupnya (tombol/tap luar/back), anggap confirm.
      if (onConfirm) onConfirm();
      return;
    }
    if (action === "confirm" && onConfirm) onConfirm();
    if (action === "cancel" && onCancel) onCancel();
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => close("cancel")}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => close("cancel")}>
        <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
          <View style={[styles.iconCircle, { backgroundColor: state.danger ? "#fee2e2" : "#ede9fe" }]}>
            <AppIcon name="help-circle-outline" size={26} color={state.danger ? "#dc2626" : "#78008e"} />
          </View>
          <Text style={styles.title}>{state.title}</Text>
          {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
          <View style={styles.btnRow}>
            {!state.hideCancel ? (
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => close("cancel")}>
                <Text style={styles.btnCancelText}>{state.cancelText}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: state.danger ? "#dc2626" : "#78008e" }]}
              onPress={() => close("confirm")}
            >
              <Text style={styles.btnConfirmText}>{state.confirmText}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,10,30,0.3)" },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    paddingVertical: 22,
    paddingHorizontal: 24,
    alignItems: "center",
    width: 280,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  title: { fontSize: 15.5, fontFamily: fontFamily.extraBold, color: "#1c1a27", textAlign: "center" },
  message: { fontSize: 12.5, fontFamily: fontFamily.medium, color: "#6b6280", textAlign: "center", marginTop: 5, lineHeight: 18 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 18, width: "100%" },
  btn: { flex: 1, borderRadius: radius.sm, paddingVertical: 12, alignItems: "center" },
  btnCancel: { backgroundColor: "#f3f1f7" },
  btnCancelText: { color: "#1c1a27", fontSize: 13.5, fontFamily: fontFamily.bold },
  btnConfirmText: { color: "#fff", fontSize: 13.5, fontFamily: fontFamily.bold },
});
