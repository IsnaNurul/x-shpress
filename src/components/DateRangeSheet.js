import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import BottomSheet from "./BottomSheet";
import { FieldLabel, PrimaryButton } from "./ui";
import AppIcon from "./AppIcon";
import { formatDateShort, todayISO, dateToISO } from "../utils/format";

// BottomSheet filter periode tanggal, dipakai bareng di ActivityScreen/DriverLogScreen/
// DeliveriesScreen -- bisa pilih cuma 1 hari (Dari == Sampai) atau rentang beberapa hari.
export default function DateRangeSheet({ visible, onClose, start, end, onApply, allowAll, onSelectAll }) {
  const { colors } = useAppTheme();
  const [tempStart, setTempStart] = useState(new Date());
  const [tempEnd, setTempEnd] = useState(new Date());

  useEffect(() => {
    if (visible) {
      setTempStart(new Date((start || todayISO()) + "T00:00:00"));
      setTempEnd(new Date((end || start || todayISO()) + "T00:00:00"));
    }
  }, [visible, start, end]);

  function applyToday() {
    const t = todayISO();
    onApply(t, t);
    onClose();
  }

  function applyRange() {
    let s = dateToISO(tempStart);
    let e = dateToISO(tempEnd);
    if (s > e) [s, e] = [e, s];
    onApply(s, e);
    onClose();
  }

  function openAndroidPicker(which) {
    DateTimePickerAndroid.open({
      value: which === "start" ? tempStart : tempEnd,
      mode: "date",
      maximumDate: new Date(),
      onChange: (event, selected) => {
        if (event.type === "set" && selected) {
          if (which === "start") setTempStart(selected);
          else setTempEnd(selected);
        }
      },
    });
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filter Tanggal">
      <TouchableOpacity onPress={applyToday} style={[styles.quickBtn, { backgroundColor: colors.purple2 }]}>
        <AppIcon name="today-outline" size={16} color="#fff" />
        <Text style={{ color: "#fff", fontFamily: fontFamily.bold, fontSize: 13.5 }}>Hari Ini</Text>
      </TouchableOpacity>

      {allowAll ? (
        <TouchableOpacity
          onPress={() => {
            onSelectAll();
            onClose();
          }}
          style={[styles.quickBtn, { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, marginTop: 8 }]}
        >
          <AppIcon name="albums-outline" size={16} color={colors.text} />
          <Text style={{ color: colors.text, fontFamily: fontFamily.bold, fontSize: 13.5 }}>Semua Tanggal</Text>
        </TouchableOpacity>
      ) : null}

      <FieldLabel>Atau pilih periode (1 hari atau beberapa hari)</FieldLabel>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.miniLabel, { color: colors.textMuted }]}>Dari Tanggal</Text>
          {Platform.OS === "ios" ? (
            <DateTimePicker
              value={tempStart}
              mode="date"
              display="compact"
              maximumDate={new Date()}
              onChange={(event, selected) => {
                if (selected) setTempStart(selected);
              }}
            />
          ) : (
            <TouchableOpacity onPress={() => openAndroidPicker("start")} style={[styles.dateField, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontFamily: fontFamily.semiBold, fontSize: 12.5 }} numberOfLines={1}>
                {formatDateShort(dateToISO(tempStart))}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.miniLabel, { color: colors.textMuted }]}>Sampai Tanggal</Text>
          {Platform.OS === "ios" ? (
            <DateTimePicker
              value={tempEnd}
              mode="date"
              display="compact"
              maximumDate={new Date()}
              onChange={(event, selected) => {
                if (selected) setTempEnd(selected);
              }}
            />
          ) : (
            <TouchableOpacity onPress={() => openAndroidPicker("end")} style={[styles.dateField, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontFamily: fontFamily.semiBold, fontSize: 12.5 }} numberOfLines={1}>
                {formatDateShort(dateToISO(tempEnd))}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <PrimaryButton title="Terapkan" onPress={applyRange} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  quickBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.md, padding: 14 },
  miniLabel: { fontSize: 11, fontFamily: fontFamily.bold, marginBottom: 6 },
  dateField: { borderWidth: 1.5, borderRadius: radius.sm, paddingVertical: 12, paddingHorizontal: 10, alignItems: "center" },
});
