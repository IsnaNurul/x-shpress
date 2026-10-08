import React, { useEffect } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import { useApp } from "../context/AppContext";
import AppIcon from "./AppIcon";

export default function BottomSheet({ visible, onClose, title, children }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
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
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: 30 + insets.bottom }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
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
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 30,
    maxHeight: "88%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    alignSelf: "center",
    marginVertical: 10,
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
