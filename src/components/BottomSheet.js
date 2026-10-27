import React, { useEffect } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import { useApp } from "../context/AppContext";
import AppIcon from "./AppIcon";

export default function BottomSheet({ visible, onClose, title, children }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { pushSheet, popSheet } = useApp();

  useEffect(() => {
    if (!visible) return;
    pushSheet();
    return () => popSheet();
  }, [visible, pushSheet, popSheet]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.kavWrap} pointerEvents="box-none">
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.card, paddingBottom: 26, marginBottom: insets.bottom, maxHeight: windowHeight * 0.82 },
            ]}
          >
            <View style={styles.head}>
              <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.bg }]}>
                <AppIcon name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,10,30,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  // Form sekarang muncul sbg modal di TENGAH layar (bukan slide-up dari bawah lagi) -- jadi semua
  // sudutnya dibikin rounded (lihat `sheet.borderRadius`), bukan cuma sudut atas doang kayak
  // bottom sheet sebelumnya.
  kavWrap: {
    width: "100%",
    alignItems: "center",
  },
  sheet: {
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 20,
    width: "100%",
    maxWidth: 440,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontFamily: fontFamily.extraBold,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
