import { createNavigationContainerRef } from "@react-navigation/native";

// Ref global biar bisa navigate dari LUAR tree komponen (mis. dari listener notifikasi di
// pushNotifications.js, yg nggak punya akses langsung ke navigation prop). Dipasang ke
// <NavigationContainer ref={navigationRef}> di navigation/index.js.
export const navigationRef = createNavigationContainerRef();

// Buka tab "Pengiriman" -- dipanggil pas push notification "Tugas Pengiriman Baru" di-tap.
// isReady() dicek dulu krn navigator-nya mungkin belum sempat mount (mis. notifikasi ditap pas
// app br dibuka dari kondisi ketutup total -- lihat pemanggilnya di pushNotifications.js yg
// nunggu event "state change" kalau belum ready).
export function navigateToPengiriman() {
  if (navigationRef.isReady()) {
    navigationRef.navigate("Main", { screen: "Pengiriman" });
  }
}
