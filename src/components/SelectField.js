import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Modal, FlatList, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import { useApp } from "../context/AppContext";
import AppIcon from "./AppIcon";

// Kolom cari cuma muncul kalau opsinya banyak (>8) -- biar nggak keliatan berlebihan utk
// pilihan pendek kayak jenis kendala, tapi tetap kepake enak kalau isinya puluhan/ratusan.
const SEARCH_THRESHOLD = 8;

export default function SelectField({ value, options, placeholder, onChange }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { pushSheet, popSheet } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.sublabel || "").toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    pushSheet();
    return () => popSheet();
  }, [open, pushSheet, popSheet]);

  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.field, { backgroundColor: colors.bg, borderColor: colors.border }]}
        activeOpacity={0.8}
      >
        <Text style={[styles.fieldText, { color: selected ? colors.text : colors.textMuted }]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <AppIcon name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: 24 + insets.bottom }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            {options.length > SEARCH_THRESHOLD ? (
              <View style={[styles.searchBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <AppIcon name="search-outline" size={16} color={colors.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Cari..."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.searchInput, { color: colors.text }]}
                  autoFocus
                />
                {query ? (
                  <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <AppIcon name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            {filteredOptions.length === 0 ? (
              <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 20, fontSize: 13.5 }}>
                Tidak ada hasil untuk "{query}".
              </Text>
            ) : (
              <FlatList
                data={filteredOptions}
                keyExtractor={(item) => String(item.value)}
                style={{ maxHeight: 360 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.optionRow, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={{ color: item.value === value ? colors.purple2 : colors.text, fontFamily: item.value === value ? fontFamily.bold : fontFamily.medium, fontSize: 14.5 }}>
                      {item.label}
                    </Text>
                    {item.sublabel ? (
                      <Text style={{ color: colors.textMuted, fontSize: 11.5, fontFamily: fontFamily.regular, marginTop: 2 }} numberOfLines={1}>
                        {item.sublabel}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  fieldText: { fontSize: 15, flex: 1, fontFamily: fontFamily.regular },
  overlay: { flex: 1, backgroundColor: "rgba(15,10,30,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 12, paddingBottom: 24, maxHeight: "70%" },
  handle: { width: 40, height: 4, borderRadius: 999, alignSelf: "center", marginVertical: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    marginHorizontal: 10,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14.5, fontFamily: fontFamily.regular, paddingVertical: 11 },
  optionRow: { paddingVertical: 15, paddingHorizontal: 10, borderBottomWidth: 1 },
});
