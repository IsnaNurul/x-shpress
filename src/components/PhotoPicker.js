import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ActionSheetIOS, Platform, Alert } from "react-native";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import { pickPhotoFromCamera, pickPhotoFromLibrary } from "../utils/photo";
import { SecondaryButton } from "./ui";

export default function PhotoPicker({ value, onChange, onPressPreview }) {
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);

  async function handlePick() {
    if (busy) return;
    const choose = (fn) => async () => {
      setBusy(true);
      try {
        const uri = await fn();
        if (uri) onChange(uri);
      } catch (e) {
        Alert.alert("Gagal", "Gagal memproses foto, coba lagi.");
      } finally {
        setBusy(false);
      }
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Batal", "Ambil Foto", "Pilih dari Galeri"], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) choose(pickPhotoFromCamera)();
          if (idx === 2) choose(pickPhotoFromLibrary)();
        }
      );
    } else {
      Alert.alert("Foto Bukti", "Pilih sumber foto", [
        { text: "Batal", style: "cancel" },
        { text: "Ambil Foto", onPress: choose(pickPhotoFromCamera) },
        { text: "Pilih dari Galeri", onPress: choose(pickPhotoFromLibrary) },
      ]);
    }
  }

  return (
    <View style={{ marginTop: 8 }}>
      {value ? (
        <TouchableOpacity onPress={() => onPressPreview && onPressPreview(value)} activeOpacity={0.9}>
          <Image source={{ uri: value }} style={styles.preview} />
        </TouchableOpacity>
      ) : (
        <View style={[styles.emptyBox, { borderColor: colors.border, backgroundColor: colors.bg }]}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Belum ada foto</Text>
        </View>
      )}
      <View style={styles.actions}>
        <SecondaryButton
          title={busy ? "Memproses..." : "Ambil / Pilih Foto"}
          icon={busy ? undefined : { name: "camera-outline" }}
          onPress={handlePick}
        />
        {value ? <SecondaryButton title="Hapus" danger onPress={() => onChange(null)} style={{ flex: 0, paddingHorizontal: 16 }} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: "100%",
    height: 200,
    borderRadius: radius.sm,
  },
  emptyBox: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: radius.sm,
    paddingVertical: 26,
    alignItems: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
});
