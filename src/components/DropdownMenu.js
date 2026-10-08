import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import AppIcon from "./AppIcon";

// Menu dropdown kecil (bukan Alert/ActionSheet bawaan sistem) -- muncul nempel di dekat tombol yg
// ditekan (pakai posisi Y dari titik sentuh), rata kanan layar. Dipakai buat menu titik tiga di
// list Aktivitas (Lihat Foto / Edit / Hapus).
export default function DropdownMenu({ visible, onClose, anchorY, items }) {
  const { colors } = useAppTheme();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose}>
        <View style={[styles.menu, { top: (anchorY || 0) + 8, backgroundColor: colors.card, borderColor: colors.border }]}>
          {items.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.7}
              style={[styles.item, idx < items.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : null]}
              onPress={() => {
                onClose();
                item.onPress();
              }}
            >
              {item.icon ? <AppIcon name={item.icon} size={16} color={item.danger ? colors.red : colors.text} /> : null}
              <Text style={[styles.itemText, { color: item.danger ? colors.red : colors.text }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    right: 16,
    minWidth: 170,
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, paddingHorizontal: 15 },
  itemText: { fontSize: 14, fontFamily: fontFamily.semiBold },
});
