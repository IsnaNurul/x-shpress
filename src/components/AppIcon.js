import React from "react";
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";

const SETS = { Ionicons, MaterialCommunityIcons, MaterialIcons };

export default function AppIcon({ lib = "Ionicons", name, size = 18, color = "#000", style }) {
  const Comp = SETS[lib] || Ionicons;
  return <Comp name={name} size={size} color={color} style={style} />;
}
