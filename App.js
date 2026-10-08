import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";

import { AppProvider, useApp } from "./src/context/AppContext";
import RootNavigation from "./src/navigation";
import useAppTheme from "./src/hooks/useAppTheme";
import StatusPopup from "./src/components/StatusPopup";
import ConfirmPopup from "./src/components/ConfirmPopup";

SplashScreen.preventAutoHideAsync().catch(() => {});

function AppReady({ children }) {
  const { loading } = useApp();
  const { colors } = useAppTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.purple2} />
      </View>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontError) console.error("Gagal memuat font:", fontError);
    // Tutup splash screen native begitu font selesai (atau gagal) dimuat — jangan
    // menunggu data AppContext, supaya kalau ada error setelah ini, errornya
    // langsung terlihat (LogBox) alih-alih tersembunyi di balik splash selamanya.
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <AppReady>
            <RootNavigation />
            <StatusBar style="light" />
          </AppReady>
        </AppProvider>
      </SafeAreaProvider>
      <StatusPopup />
      <ConfirmPopup />
    </GestureHandlerRootView>
  );
}
