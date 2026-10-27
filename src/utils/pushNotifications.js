import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { navigateToPengiriman } from "../navigation/navigationRef";

// Default-nya expo-notifications TIDAK nampilin notifikasi kalau app lagi DIBUKA (foreground) --
// cuma diterima diam-diam, nggak ada banner/suara, kecuali di-set eksplisit kayak gini. Kurir
// kan sering lagi buka app pas kerja, jadi ini wajib biar notif tetap keliatan baik app lagi
// dibuka maupun di-background/ketutup. Dipanggil sekali di sini (top-level), bukan di dalam
// fungsi, biar langsung aktif begitu modul ini pertama ke-import.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Pakai FCM device token ASLI (getDevicePushTokenAsync), BUKAN Expo Push Token
// (getExpoPushTokenAsync) -- project ini sengaja pakai Firebase langsung (server ERP manggil FCM
// HTTP v1 API sendiri), bukan lewat relay server punya Expo.
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    // Emulator/simulator nggak punya push token asli -- jangan coba daftar, nanti cuma error.
    return null;
  }

  if (Platform.OS === "android") {
    // Wajib ada channel default di Android 8+ (API 26+) biar notifikasi bener-bener muncul,
    // bukan cuma diterima diam-diam di background.
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;

    const { data } = await Notifications.getDevicePushTokenAsync();
    return data || null;
  } catch (err) {
    console.error("Gagal daftar push notification:", err);
    return null;
  }
}

// CUMA cek status izin notifikasi saat ini, JANGAN minta izin -- dipakai ProfileScreen buat
// nampilin badge "Notifikasi: Aktif/Nonaktif", beda dari registerForPushNotificationsAsync() yg
// bakal nongolin popup izin kalau belum di-granted.
export async function getPushNotificationStatus() {
  if (!Device.isDevice) return "granted"; // emulator -- jangan nampilin "nonaktif" yg nyesatin
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "granted";
  return canAskAgain ? "denied" : "blocked";
}

// Dipanggil pas token berubah di tengah sesi (jarang, tapi bisa kejadian -- mis. token FCM
// di-refresh sama sistem). `onToken` dipanggil ulang tiap ada token baru.
export function addPushTokenListener(onToken) {
  const sub = Notifications.addPushTokenListener((event) => {
    if (event?.data) onToken(event.data);
  });
  return () => sub.remove();
}

// Buka tab "Pengiriman" pas notifikasi "Tugas Pengiriman Baru" di-tap -- nangkep 2 skenario:
//  1. App lagi jalan (foreground/background, belum ketutup) -> listener live di bawah.
//  2. App kebuka PERTAMA KALI gara2 tap notif (cold start dari kondisi ketutup total) -> dicek
//     sekali pas modul ini ke-import lewat getLastNotificationResponseAsync(), krn listener live
//     nggak nangkep tap yg kejadian SEBELUM app selesai mulai.
export function setupNotificationTapHandler() {
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) navigateToPengiriman();
  });
  const sub = Notifications.addNotificationResponseReceivedListener(() => {
    navigateToPengiriman();
  });
  return () => sub.remove();
}
