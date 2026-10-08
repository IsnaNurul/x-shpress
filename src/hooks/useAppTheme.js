import { useColorScheme } from "react-native";
import { lightColors, darkColors } from "../theme";
import { useApp } from "../context/AppContext";

export default function useAppTheme() {
  const scheme = useColorScheme();
  const { profile } = useApp();
  const pref = profile?.themePref || "system";
  const isDark = pref === "dark" ? true : pref === "light" ? false : scheme === "dark";
  return { colors: isDark ? darkColors : lightColors, isDark };
}
