import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Modal, FlatList, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import { useApp } from "../context/AppContext";
import AppIcon from "./AppIcon";

// Sama pola-nya kayak SelectField (field ringkas -> buka modal), cuma ini multi-pilih (checkbox,
// nggak otomatis nutup pas tap 1 opsi) + ada "Pilih Semua"/"Kosongkan" & kolom cari kalau banyak.
const SEARCH_THRESHOLD = 8;

export default function MultiSelectField({ items, selectedIds, onChange, placeholder }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { pushSheet, popSheet } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    pushSheet();
    return () => popSheet();
  }, [open, pushSheet, popSheet]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.trim().toLowerCase();
    return items.filter((it) => it.label.toLowerCase().includes(q) || (it.sublabel || "").toLowerCase().includes(q));
  }, [items, query]);

  function toggle(id) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  const summary = selectedIds.length > 0 ? `${selectedIds.length} dari ${items.length} dipilih` : placeholder;

  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.field, { backgroundColor: colors.bg, borderColor: colors.border }]}
        activeOpacity={0.8}
      >
        <Text style={[styles.fieldText, { color: selectedIds.length > 0 ? colors.text : colors.textMuted }]} numberOfLines={1}>
          {summary}
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

            <View style={styles.headRow}>
              <Text style={{ color: colors.textMuted, fontSize: 12.5, fontFamily: fontFamily.semiBold }}>
                {selectedIds.length}/{items.length} dipilih
              </Text>
              <View style={{ flexDirection: "row", gap: 14 }}>
                <TouchableOpacity onPress={() => onChange(items.map((it) => it.id))}>
                  <Text style={{ color: colors.purple2, fontSize: 12.5, fontFamily: fontFamily.bold }}>Pilih Semua</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onChange([])}>
                  <Text style={{ color: colors.red, fontSize: 12.5, fontFamily: fontFamily.bold }}>Kosongkan</Text>
                </TouchableOpacity>
              </View>
            </View>

            {items.length > SEARCH_THRESHOLD ? (
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

            {filtered.length === 0 ? (
              <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 20, fontSize: 13.5 }}>
                Tidak ada hasil{query ? ` untuk "${query}"` : ""}.
              </Text>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => String(item.id)}
                style={{ maxHeight: 340 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const checked = selectedIds.includes(item.id);
                  return (
                    <TouchableOpacity
                      style={[styles.optionRow, { borderBottomColor: colors.border }]}
                      onPress={() => toggle(item.id)}
                    >
                      <View
                        style={[
                          styles.box,
                          { borderColor: checked ? colors.purple2 : colors.border, backgroundColor: checked ? colors.purple2 : "transparent" },
                        ]}
                      >
                        {checked ? <AppIcon name="checkmark" size={12} color="#fff" /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontFamily: fontFamily.medium, fontSize: 14.5 }} numberOfLines={1}>
                          {item.label}
                        </Text>
                        {item.sublabel ? (
                          <Text style={{ color: colors.textMuted, fontSize: 11.5, fontFamily: fontFamily.regular, marginTop: 2 }} numberOfLines={1}>
                            {item.sublabel}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <TouchableOpacity onPress={() => setOpen(false)} style={[styles.doneBtn, { backgroundColor: colors.purple2 }]}>
              <Text style={{ color: "#fff", fontFamily: fontFamily.bold, fontSize: 14.5 }}>Selesai</Text>
            </TouchableOpacity>
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
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 12, paddingBottom: 24, maxHeight: "80%" },
  handle: { width: 40, height: 4, borderRadius: 999, alignSelf: "center", marginVertical: 10 },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 8, marginBottom: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    marginHorizontal: 8,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14.5, fontFamily: fontFamily.regular, paddingVertical: 11 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 10, borderBottomWidth: 1 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  doneBtn: { marginTop: 14, marginHorizontal: 8, borderRadius: radius.sm, paddingVertical: 13, alignItems: "center" },
});
