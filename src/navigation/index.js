import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily } from "../theme";
import { useApp } from "../context/AppContext";
import AppIcon from "../components/AppIcon";
import { navigationRef } from "./navigationRef";

import HomeScreen from "../screens/HomeScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import DeliveriesScreen from "../screens/DeliveriesScreen";
import DeliveryDetailScreen from "../screens/DeliveryDetailScreen";
import ActivityScreen from "../screens/ActivityScreen";
import DriverLogScreen from "../screens/DriverLogScreen";
import ProfileScreen from "../screens/ProfileScreen";
import LoginScreen from "../screens/LoginScreen";

const Tab = createBottomTabNavigator();
const PengirimanStack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

// "Pengiriman" sengaja ditaruh di tengah array (posisi ke-3 dari 5) supaya jadi tombol pop-up
// utama di navbar, sesuai urutan Tab.Screen di bawah. Menu "Pengeluaran" & "Kendala" digabung
// jadi 1 tab "Aktivitas" (sesuai struktur doctype ERP "Driver Activity"); "Log Driver" nampilin
// rekap harian yg sama dengan yg disync ke doctype ERP "Driver Log".
const TABS = [
  { name: "HomeTab", label: "Home", iconOutline: "home-outline", iconFilled: "home" },
  { name: "Aktivitas", label: "Aktivitas", iconOutline: "albums-outline", iconFilled: "albums" },
  { name: "Pengiriman", label: "Pengiriman", iconOutline: "cube-outline", iconFilled: "cube", center: true },
  { name: "LogDriver", label: "Log Driver", iconOutline: "bar-chart-outline", iconFilled: "bar-chart" },
  { name: "Profil", label: "Profil", iconOutline: "person-outline", iconFilled: "person" },
];

function PengirimanStackScreen() {
  return (
    <PengirimanStack.Navigator screenOptions={{ headerShown: false }}>
      <PengirimanStack.Screen name="PengirimanList" component={DeliveriesScreen} />
      <PengirimanStack.Screen name="DeliveryDetail" component={DeliveryDetailScreen} />
    </PengirimanStack.Navigator>
  );
}

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="Notifications" component={NotificationsScreen} />
    </HomeStack.Navigator>
  );
}

function CustomTabBar({ state, navigation }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { sheetOpen } = useApp();

  if (sheetOpen) return null;

  return (
    <View
      style={[
        styles.tabBar,
        { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 10), shadowColor: "#321e5a" },
      ]}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const meta = TABS.find((t) => t.name === route.name);

        if (meta.center) {
          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              style={styles.centerItem}
              activeOpacity={0.85}
            >
              <View
                style={[
                  styles.centerRing,
                  { borderColor: isFocused ? colors.purple2 : "transparent" },
                ]}
              >
                <View style={[styles.centerCircle, { backgroundColor: colors.purple2, borderColor: colors.card }]}>
                  <AppIcon name={meta.iconFilled} size={26} color="#fff" />
                </View>
              </View>
              <Text
                style={{
                  fontSize: 10,
                  marginTop: 2,
                  color: isFocused ? colors.purple2 : colors.textMuted,
                  fontFamily: isFocused ? fontFamily.extraBold : fontFamily.semiBold,
                }}
                numberOfLines={1}
              >
                {meta.label}
              </Text>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity
            key={route.key}
            onPress={() => navigation.navigate(route.name)}
            style={styles.tabItem}
            activeOpacity={0.75}
          >
            <View style={styles.iconWrap}>
              <AppIcon
                name={isFocused ? meta.iconFilled : meta.iconOutline}
                size={20}
                color={isFocused ? colors.purple2 : colors.textMuted}
              />
            </View>
            <Text
              style={{
                fontSize: 10,
                marginTop: 3,
                color: isFocused ? colors.purple2 : colors.textMuted,
                fontFamily: isFocused ? fontFamily.extraBold : fontFamily.semiBold,
              }}
              numberOfLines={1}
            >
              {meta.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tab.Screen name="HomeTab" component={HomeStackScreen} />
      <Tab.Screen name="Aktivitas" component={ActivityScreen} />
      <Tab.Screen name="Pengiriman" component={PengirimanStackScreen} />
      <Tab.Screen name="LogDriver" component={DriverLogScreen} />
      <Tab.Screen name="Profil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigation() {
  const { colors, isDark } = useAppTheme();
  const { isLoggedIn } = useApp();

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={{
        dark: isDark,
        colors: {
          primary: colors.purple2,
          background: colors.bg,
          card: colors.card,
          text: colors.text,
          border: colors.border,
          notification: colors.red,
        },
        fonts: {
          regular: { fontFamily: fontFamily.regular, fontWeight: "400" },
          medium: { fontFamily: fontFamily.medium, fontWeight: "500" },
          bold: { fontFamily: fontFamily.bold, fontWeight: "700" },
          heavy: { fontFamily: fontFamily.extraBold, fontWeight: "800" },
        },
      }}
    >
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isLoggedIn ? (
          <RootStack.Screen name="Main" component={MainTabs} />
        ) : (
          <RootStack.Screen name="Login" component={LoginScreen} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginHorizontal: 20,
    marginBottom: Platform.OS === "ios" ? 6 : 14,
    borderRadius: 30,
    paddingTop: 10,
    paddingHorizontal: 8,
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "visible",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  centerItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  centerRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    marginTop: -38,
    alignItems: "center",
    justifyContent: "center",
  },
  centerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#78008e",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
