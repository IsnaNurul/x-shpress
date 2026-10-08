import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import AppIcon from "./AppIcon";

export function Card({ style, children }) {
  const { colors } = useAppTheme();
  return <View style={[styles.card, { backgroundColor: colors.card }, style]}>{children}</View>;
}

export function FieldLabel({ children, required }) {
  const { colors } = useAppTheme();
  return (
    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
      {children}
      {required ? <Text style={{ color: colors.red }}> *</Text> : null}
    </Text>
  );
}

export function TextField({ style, ...props }) {
  const { colors } = useAppTheme();
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }, style]}
      {...props}
    />
  );
}

export function PrimaryButton({ title, icon, onPress, style, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[styles.primaryBtn, disabled && { opacity: 0.5 }, style]}
    >
      {icon ? <AppIcon {...icon} size={17} color="#fff" /> : null}
      <Text style={styles.primaryBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

export function SecondaryButton({ title, icon, onPress, style, danger }) {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.secondaryBtn,
        { backgroundColor: colors.card, borderColor: danger ? colors.redSoft : colors.border },
        style,
      ]}
    >
      {icon ? <AppIcon {...icon} size={15} color={danger ? colors.red : colors.text} /> : null}
      <Text style={[styles.secondaryBtnText, { color: danger ? colors.red : colors.text }]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Badge({ label, icon, colorKey = "orange" }) {
  const { colors } = useAppTheme();
  const soft = colors[colorKey + "Soft"] || colors.orangeSoft;
  const solid = colors[colorKey] || colors.orange;
  return (
    <View style={[styles.badge, { backgroundColor: soft }]}>
      {icon ? <AppIcon {...icon} size={12} color={solid} /> : null}
      <Text style={[styles.badgeText, { color: solid }]}>{label}</Text>
    </View>
  );
}

export function Chip({ label, icon, selected, onPress, style, textStyle }) {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.purple2 : colors.card,
          borderColor: selected ? "transparent" : colors.border,
        },
        style,
      ]}
    >
      {icon ? <AppIcon {...icon} size={15} color={selected ? "#fff" : colors.text} /> : null}
      <Text style={[styles.chipText, { color: selected ? "#fff" : colors.text }, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function OptionItem({ label, selected, onPress }) {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={[
        styles.optionItem,
        {
          backgroundColor: selected ? colors.purple2 : colors.card,
          borderColor: selected ? "transparent" : colors.border,
        },
      ]}
    >
      <Text style={[styles.optionItemText, { color: selected ? "#fff" : colors.text, fontFamily: selected ? fontFamily.bold : fontFamily.semiBold }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function SectionHead({ title, action, onAction }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.sectionHead}>
      <Text style={[styles.sectionHeadTitle, { color: colors.text }]}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction} style={[styles.linkBtn, { backgroundColor: colors.blueSoft }]}>
          <Text style={[styles.linkBtnText, { color: colors.purple2 }]}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: 18,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontFamily: fontFamily.bold,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    width: "100%",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    fontSize: 15,
    fontFamily: fontFamily.regular,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: radius.sm,
    backgroundColor: "#78008e",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: fontFamily.bold,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.sm,
    borderWidth: 1.5,
  },
  secondaryBtnText: {
    fontSize: 13.5,
    fontFamily: fontFamily.bold,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: 13,
    fontFamily: fontFamily.bold,
  },
  optionItem: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: radius.sm,
    borderWidth: 1.5,
  },
  optionItemText: {
    fontSize: 14,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionHeadTitle: {
    fontSize: 15.5,
    fontFamily: fontFamily.bold,
  },
  linkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  linkBtnText: {
    fontSize: 13,
    fontFamily: fontFamily.bold,
  },
});
