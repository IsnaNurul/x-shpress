import React, { useEffect } from "react";
import { Modal, View, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useApp } from "../context/AppContext";
import AppIcon from "./AppIcon";

export default function Lightbox({ uri, onClose }) {
  const { pushSheet, popSheet } = useApp();

  useEffect(() => {
    if (!uri) return;
    pushSheet();
    return () => popSheet();
  }, [uri, pushSheet, popSheet]);

  return (
    <Modal
      visible={!!uri}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <AppIcon name="close" size={20} color="#fff" />
        </TouchableOpacity>
        {uri ? <Image source={{ uri }} style={styles.image} resizeMode="contain" /> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(5,0,15,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  image: {
    width: "100%",
    height: "80%",
    borderRadius: 12,
  },
  closeBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
});
