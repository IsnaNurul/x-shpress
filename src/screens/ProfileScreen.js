import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import { useApp } from "../context/AppContext";
import { Card, Badge, OptionItem } from "../components/ui";
import BottomSheet from "../components/BottomSheet";
import { showConfirmPopup } from "../components/ConfirmPopup";
import AppIcon from "../components/AppIcon";
import { initialsOf, todayISO } from "../utils/format";
import { getPushNotificationStatus, registerForPushNotificationsAsync } from "../utils/pushNotifications";
import { erpSaveFcmToken } from "../api/erpClient";

const THEME_OPTIONS = [
  { id: "system", label: "Ikuti Sistem", icon: { name: "contrast-outline" } },
  { id: "light", label: "Terang", icon: { name: "sunny-outline" } },
  { id: "dark", label: "Gelap", icon: { name: "moon-outline" } },
];

const FAQ_ITEMS = [
  {
    q: "Bagaimana urutan pakai app ini dari awal hari?",
    a: "Setiap hari wajib mulai dengan Pengecekan Kendaraan dulu (pilih kendaraan, isi checklist, foto) sebelum bisa 'Mulai Hari Ini'. Setelah itu baru bisa Transit (ambil barang), Selesai (tandai pengiriman selesai), dan ditutup dengan Akhiri Hari di akhir shift.",
  },
  {
    q: "Kenapa saya harus Pengecekan Kendaraan dulu?",
    a: "Pengecekan Kendaraan jadi gerbang wajib sekali di awal hari -- tombol 'Mulai Hari Ini' baru muncul setelah Pengecekan hari itu berhasil disimpan.",
  },
  {
    q: "Apa bedanya Transit dan Selesai?",
    a: "Transit dipakai buat catat pengambilan barang di outlet (opsional dikaitkan ke pengiriman tertentu). Selesai dipakai buat menandai pengiriman sudah terkirim ke customer -- bisa dipakai baik untuk pengiriman yang masih 'Ditugaskan' maupun yang sudah 'Dalam Perjalanan' (Transit), nggak harus Transit dulu.",
  },
  {
    q: "Kendaraan yang saya pakai berubah di tengah hari, gimana?",
    a: "Setiap aksi (Mulai, Transit, Selesai, Akhiri Hari, dan Aktivitas) punya pilihan kendaraan sendiri-sendiri -- defaultnya ngikutin kendaraan dari Pengecekan/aksi sebelumnya, tapi bisa diganti kapan saja kalau kendaraannya beda.",
  },
  {
    q: "Apa itu menu Kendala?",
    a: "Gunakan menu Kendala (di tab Aktivitas) untuk melaporkan hambatan yang tidak terkait 1 pengiriman spesifik, misalnya kendaraan bermasalah atau akses jalan tertutup.",
  },
  {
    q: "Kenapa ada pengiriman yang otomatis berubah jadi 'Gagal'?",
    a: "Status 'Gagal' ditentukan otomatis oleh ERP kalau 1 pengiriman belum terkirim sampai akhir hari -- bukan sesuatu yang perlu/bisa ditandai manual dari mobile.",
  },
  {
    q: "Apa itu 'Pesanan Tersedia' di tab Pengiriman?",
    a: "Itu daftar pesanan dari customer yang belum ditugaskan ke driver manapun. Tekan 'Ambil Pesanan' buat menjadikan pesanan itu tugas kamu sendiri -- setelah diambil, langsung muncul juga di 'Tugas Saya'.",
  },
  {
    q: "Bagaimana cara mencatat pengeluaran/aktivitas lain?",
    a: "Buka menu Aktivitas, tekan tombol tambah (+), pilih tipe (Pengeluaran/Kendala/Cuci Kendaraan), lalu isi datanya -- foto wajib di hampir semua tipe.",
  },
];

// Nama/ID Kurir/Telepon SEMUA dari ERP (Employee), diisi otomatis pas login -- halaman ini
// murni tampilan, tidak ada lagi fitur edit manual supaya tidak ada data yg keliatan seperti
// identitas resmi dari server tapi sebenarnya cuma tersimpan di HP.
export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const { profile, updateProfile, deliveries, logout } = useApp();

  const [themeOpen, setThemeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Izin notifikasi OPSIONAL (beda dari lokasi yg wajib) -- dicek ulang tiap tab Profil difokus,
  // biar kalau kurir ubah izinnya lewat Setting HP pas app lagi di background, badge-nya ikut
  // update pas balik ke sini.
  const [notifStatus, setNotifStatus] = useState(null); // null=lagi cek, "granted"|"denied"|"blocked"
  const [notifChecking, setNotifChecking] = useState(false);
  useFocusEffect(
    useCallback(() => {
      getPushNotificationStatus().then(setNotifStatus);
    }, [])
  );

  async function fixNotifPermission() {
    if (notifChecking) return;
    if (notifStatus === "blocked") {
      Linking.openSettings();
      return;
    }
    setNotifChecking(true);
    try {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        await erpSaveFcmToken(token).catch((err) => console.error("Gagal simpan push token ke ERP:", err));
      }
    } finally {
      setNotifChecking(false);
      getPushNotificationStatus().then(setNotifStatus);
    }
  }

  const themePref = profile.themePref || "system";
  const themeLabel = THEME_OPTIONS.find((t) => t.id === themePref)?.label || "Ikuti Sistem";

  // Kendaraan tugas murni dari data ERP (vehicle_type / field "vehicle") di salah satu
  // pengiriman hari ini -- tidak ada penyimpanan lokal lagi.
  const todaysDeliveries = useMemo(() => deliveries.filter((d) => d.date === todayISO()), [deliveries]);
  const vehicleType = todaysDeliveries.find((d) => d.vehicleType)?.vehicleType || null;
  const vehiclePlat = todaysDeliveries.find((d) => d.vehiclePlat)?.vehiclePlat || null;

  function confirmLogout() {
    showConfirmPopup({
      title: "Keluar Akun",
      message: "Yakin ingin keluar dari akun ini?",
      confirmText: "Keluar",
      danger: true,
      onConfirm: logout,
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: colors.purple2 }]}>
          <View style={styles.avatarLg}>
            <Text style={styles.avatarLgText}>{initialsOf(profile.nama)}</Text>
          </View>
          <Text style={styles.name}>{profile.nama || "Kurir"}</Text>
          <Text style={styles.sub}>{profile.idKurir || "-"} · Kurir Aktif</Text>
          {profile.telepon ? <Text style={styles.phone}>{profile.telepon}</Text> : null}
        </View>

        <Card>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Kendaraan Tugas Hari Ini</Text>
          <View style={styles.vehicleRow}>
            <View style={[styles.vehicleIcon, { backgroundColor: colors.redSoft }]}>
              <AppIcon lib="MaterialCommunityIcons" name="moped-outline" size={22} color={colors.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.vehicleName, { color: colors.text }]}>{vehicleType || "Belum diatur"}</Text>
              <Text style={[styles.vehicleSub, { color: colors.textMuted }]}>{vehiclePlat || "-"}</Text>
            </View>
            <Badge label={vehicleType ? "Aktif" : "Kosong"} colorKey={vehicleType ? "green" : "orange"} />
          </View>
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Lainnya</Text>
        {notifStatus && notifStatus !== "granted" ? (
          <TouchableOpacity
            onPress={fixNotifPermission}
            activeOpacity={0.8}
            style={[styles.navRow, { backgroundColor: colors.card }]}
          >
            <View style={[styles.navIcon, { backgroundColor: colors.orangeSoft }]}>
              <AppIcon name="notifications-off-outline" size={18} color={colors.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontFamily: fontFamily.bold }}>Notifikasi</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
                {notifChecking
                  ? "Memproses..."
                  : notifStatus === "blocked"
                  ? "Nonaktif -- tap buat buka Pengaturan HP"
                  : "Nonaktif -- tap buat aktifin"}
              </Text>
            </View>
            <Badge label="Nonaktif" colorKey="orange" />
          </TouchableOpacity>
        ) : null}
        <NavRow
          icon={{ name: "contrast-outline" }}
          title="Tema Aplikasi"
          sub={themeLabel}
          colors={colors}
          onPress={() => setThemeOpen(true)}
        />
        <NavRow
          icon={{ name: "help-circle-outline" }}
          title="Bantuan & Panduan"
          sub="Pertanyaan yang sering ditanyakan"
          colors={colors}
          onPress={() => setHelpOpen(true)}
        />
        <NavRow
          icon={{ name: "information-circle-outline" }}
          title="Tentang Aplikasi"
          sub="Versi, info, & dukungan"
          colors={colors}
          onPress={() => setAboutOpen(true)}
        />
        <NavRow
          icon={{ name: "log-out-outline" }}
          title="Keluar Akun"
          sub="Kembali ke halaman login"
          colors={colors}
          danger
          onPress={confirmLogout}
        />
      </ScrollView>

      <BottomSheet visible={themeOpen} onClose={() => setThemeOpen(false)} title="Tema Aplikasi">
        <View style={{ gap: 8 }}>
          {THEME_OPTIONS.map((t) => (
            <OptionItem
              key={t.id}
              label={t.label}
              selected={themePref === t.id}
              onPress={() => {
                updateProfile({ themePref: t.id });
                setThemeOpen(false);
              }}
            />
          ))}
        </View>
      </BottomSheet>

      <BottomSheet visible={helpOpen} onClose={() => setHelpOpen(false)} title="Bantuan & Panduan">
        <View style={{ gap: 16 }}>
          {FAQ_ITEMS.map((item, idx) => (
            <View key={idx}>
              <Text style={[styles.faqQ, { color: colors.text }]}>{item.q}</Text>
              <Text style={[styles.faqA, { color: colors.textMuted }]}>{item.a}</Text>
            </View>
          ))}
        </View>
      </BottomSheet>

      <BottomSheet visible={aboutOpen} onClose={() => setAboutOpen(false)} title="Tentang Aplikasi">
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <Image source={require("../../assets/icon.png")} style={styles.aboutLogo} />
          <Text style={[styles.aboutName, { color: colors.text }]}>X-SHPRESS</Text>
          <Text style={[styles.aboutVersion, { color: colors.textMuted }]}>Versi 1.0.0</Text>
        </View>
        <Text style={[styles.aboutDesc, { color: colors.textMuted }]}>
          Aplikasi bantu kurir X-SHA mengelola status pengiriman, pengeluaran, dan kendala operasional dalam satu tempat.
        </Text>
        <TouchableOpacity
          onPress={() => Alert.alert("Hubungi Admin", "Fitur hubungi admin akan aktif setelah integrasi sistem.")}
          style={[styles.aboutContactBtn, { backgroundColor: colors.bg }]}
        >
          <AppIcon name="chatbubble-ellipses-outline" size={16} color={colors.purple2} />
          <Text style={{ color: colors.purple2, fontFamily: fontFamily.bold, fontSize: 13.5 }}>Hubungi Admin</Text>
        </TouchableOpacity>
      </BottomSheet>
    </SafeAreaView>
  );
}

function NavRow({ icon, title, sub, onPress, colors, danger }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.navRow, { backgroundColor: colors.card }]}>
      <View style={[styles.navIcon, { backgroundColor: danger ? colors.redSoft : colors.blueSoft }]}>
        <AppIcon {...icon} size={18} color={danger ? colors.red : colors.purple2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? colors.red : colors.text, fontSize: 14, fontFamily: fontFamily.bold }}>{title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{sub}</Text>
      </View>
      {danger ? null : <AppIcon name="chevron-forward" size={18} color={colors.textMuted} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 140 },
  hero: { borderRadius: radius.lg, paddingVertical: 28, paddingHorizontal: 20, marginBottom: 16, alignItems: "center" },
  avatarLg: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  avatarLgText: { color: "#fff", fontSize: 30, fontFamily: fontFamily.extraBold },
  name: { color: "#fff", fontSize: 20, fontFamily: fontFamily.extraBold },
  sub: { color: "#fff", fontSize: 13, opacity: 0.88, marginTop: 4, fontFamily: fontFamily.bold },
  phone: { color: "#fff", fontSize: 12.5, opacity: 0.75, marginTop: 6 },
  detailLabel: { fontSize: 11, fontFamily: fontFamily.bold, letterSpacing: 0.3, marginBottom: 4 },
  vehicleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  vehicleIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  vehicleName: { fontSize: 15, fontFamily: fontFamily.extraBold },
  vehicleSub: { fontSize: 12.5, marginTop: 2 },
  sectionTitle: { fontSize: 15.5, fontFamily: fontFamily.bold, marginTop: 4, marginBottom: 12 },
  navRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  navIcon: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  faqQ: { fontSize: 14, fontFamily: fontFamily.bold, marginBottom: 4 },
  faqA: { fontSize: 13, lineHeight: 19 },
  aboutLogo: { width: 64, height: 64, marginBottom: 10 },
  aboutName: { fontSize: 17, fontFamily: fontFamily.extraBold },
  aboutVersion: { fontSize: 12.5, marginTop: 2 },
  aboutDesc: { fontSize: 13, lineHeight: 20, textAlign: "center", marginBottom: 16 },
  aboutContactBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.md, paddingVertical: 13 },
});
