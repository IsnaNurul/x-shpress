import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import useAppTheme from "../hooks/useAppTheme";
import { fontFamily, radius } from "../theme";
import { useApp } from "../context/AppContext";
import { Card, Badge } from "../components/ui";
import Lightbox from "../components/Lightbox";
import AppIcon from "../components/AppIcon";
import { formatTimestamp, formatRupiah, waLink } from "../utils/format";
import { statusLabel, statusKey, failureReasonLabel } from "../data/constants";

// Halaman ini sekarang READ-ONLY -- semua aksi (Mulai/Transit/Selesai/Gagal) dipindah ke Home,
// karena di alur baru aksi itu dipilih per-outlet/per-batch, bukan per-pengiriman dari halaman ini.
export default function DeliveryDetailScreen({ route, navigation }) {
  const { colors } = useAppTheme();
  const { deliveries, outletName } = useApp();
  const { id } = route.params;
  const item = useMemo(() => deliveries.find((d) => d.id === id), [deliveries, id]);
  const [lightboxUri, setLightboxUri] = useState(null);

  if (!item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.textMuted }}>Pengiriman tidak ditemukan.</Text>
      </SafeAreaView>
    );
  }

  const steps = [{ icon: { name: "cube-outline" }, label: "Ditugaskan", time: item.assignedAt }];
  if (item.pickupAt) {
    steps.push({
      icon: { name: "download-outline" },
      label: `Ambil barang di outlet — KM ${item.pickupKm}`,
      time: item.pickupAt,
      photo: item.pickupPhoto,
    });
  }
  if (item.deliveredAt) {
    steps.push({ icon: { name: "checkmark-circle-outline" }, label: `Selesai — KM ${item.kmArrival}`, time: item.deliveredAt, photo: item.proofPhoto });
  }
  if (item.failedAt) {
    steps.push({ icon: { name: "close-circle-outline" }, label: `Gagal — KM ${item.kmArrival} • ${failureReasonLabel(item.failureReason)}`, time: item.failedAt });
  }

  const alamatDetail = [item.rtRw, item.desa, item.district].filter(Boolean).join(" · ");
  const produkDetail = [item.itemName, item.qty ? `${item.qty} pcs` : null].filter(Boolean).join(" · ");
  const jarakDetail = item.distanceNormal
    ? `${item.distanceNormal} km${item.distanceExtra ? ` (+${item.distanceExtra} km tambahan)` : ""}`
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.card }]}>
          <AppIcon name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topbarTitle, { color: colors.text }]} numberOfLines={1}>{item.penerima}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <View style={styles.statusRow}>
            <Badge label={statusLabel(item.status)} colorKey={statusKey(item.status)} />
            <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: fontFamily.semiBold }}>
              Ditugaskan {formatTimestamp(item.assignedAt)}
            </Text>
          </View>
          {item.paymentMethod ? (
            <View
              style={[
                styles.paymentBox,
                { backgroundColor: item.paymentMethod === "COD" ? colors.orangeSoft : colors.greenSoft },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AppIcon
                  lib="MaterialCommunityIcons"
                  name={item.paymentMethod === "COD" ? "cash" : "credit-card-check-outline"}
                  size={18}
                  color={item.paymentMethod === "COD" ? colors.orange : colors.green}
                />
                <Text
                  style={{
                    fontFamily: fontFamily.bold,
                    fontSize: 13.5,
                    color: item.paymentMethod === "COD" ? colors.orange : colors.green,
                  }}
                >
                  {item.paymentMethod === "COD" ? "Bayar di Tempat (COD)" : `Sudah Dibayar · ${item.paymentMethod}`}
                </Text>
              </View>
              {item.totalHarga ? (
                <Text style={{ fontFamily: fontFamily.extraBold, fontSize: 18, color: colors.text, marginTop: 6 }}>
                  {formatRupiah(item.totalHarga)}
                </Text>
              ) : null}
            </View>
          ) : null}
          {item.noResi ? <DetailField label="ID Pengiriman" value={item.noResi} colors={colors} /> : null}
          {item.outlet ? <DetailField label="Outlet Asal" value={outletName(item.outlet)} colors={colors} /> : null}
          <DetailField label="Penerima" value={item.penerima} colors={colors} />
          {item.customerCategory ? <DetailField label="Kategori Pelanggan" value={item.customerCategory} colors={colors} /> : null}
          {item.latitude && item.longitude ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: fontFamily.bold, letterSpacing: 0.3, marginBottom: 3 }}>
                Alamat
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ fontSize: 15, color: colors.text, fontFamily: fontFamily.semiBold, flex: 1 }}>{item.alamat}</Text>
                <TouchableOpacity
                  onPress={() => Linking.openURL(`https://www.google.com/maps?q=${item.latitude},${item.longitude}`)}
                  style={[styles.callBtn, { backgroundColor: colors.blueSoft }]}
                >
                  <AppIcon name="navigate-outline" size={15} color={colors.purple2} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <DetailField label="Alamat" value={item.alamat} colors={colors} />
          )}
          {item.landmark ? <DetailField label="Patokan" value={item.landmark} colors={colors} /> : null}
          {alamatDetail ? <DetailField label="RT/RW · Desa · Kecamatan" value={alamatDetail} colors={colors} /> : null}
          {jarakDetail ? <DetailField label="Jarak Tempuh" value={jarakDetail} colors={colors} /> : null}
          {produkDetail ? <DetailField label="Produk" value={produkDetail} colors={colors} /> : null}
          {item.productPhoto ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: fontFamily.bold, letterSpacing: 0.3, marginBottom: 6 }}>
                Foto Produk yang Dibeli
              </Text>
              <TouchableOpacity onPress={() => setLightboxUri(item.productPhoto)}>
                <Image source={{ uri: item.productPhoto }} style={styles.productPhoto} />
              </TouchableOpacity>
            </View>
          ) : null}
          {item.itemLocationNote ? <DetailField label="Posisi Barang" value={item.itemLocationNote} colors={colors} /> : null}
          {item.contactNumber ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: fontFamily.bold, letterSpacing: 0.3, marginBottom: 3 }}>
                Nomor Telepon
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 15, color: colors.text, fontFamily: fontFamily.semiBold }}>{item.contactNumber}</Text>
                <TouchableOpacity
                  onPress={() => {
                    const link = waLink(item.contactNumber);
                    if (link) Linking.openURL(link);
                  }}
                  style={[styles.callBtn, { backgroundColor: colors.greenSoft }]}
                >
                  <AppIcon name="logo-whatsapp" size={15} color={colors.green} />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          {item.catatan ? <DetailField label="Catatan" value={item.catatan} colors={colors} /> : null}
        </Card>

        <Card>
          <Text style={[styles.timelineHead, { color: colors.text }]}>Riwayat Perjalanan</Text>
          {steps.map((s, idx) => (
            <View key={idx} style={styles.timelineItem}>
              <View style={styles.timelineLineWrap}>
                <View style={[styles.timelineDot, { backgroundColor: colors.blueSoft }]}>
                  <AppIcon {...s.icon} size={15} color={colors.purple2} />
                </View>
                {idx < steps.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: colors.border }]} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 18 }}>
                <Text style={[styles.timelineLabel, { color: colors.text }]}>{s.label}</Text>
                <Text style={[styles.timelineTime, { color: colors.textMuted }]}>{formatTimestamp(s.time)}</Text>
                {s.photo ? (
                  <TouchableOpacity onPress={() => setLightboxUri(s.photo)} style={{ marginTop: 8 }}>
                    <Image source={{ uri: s.photo }} style={styles.timelinePhoto} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}
        </Card>

        {item.status === "dalam_perjalanan" ? (
          <Text style={[styles.hintText, { color: colors.textMuted }]}>
            Tandai Selesai/Gagal dari halaman Home.
          </Text>
        ) : item.status === "terkirim" || item.status === "gagal" ? (
          <View style={[styles.doneNote, { backgroundColor: item.status === "gagal" ? colors.redSoft : colors.greenSoft, flexDirection: "row", justifyContent: "center", gap: 8 }]}>
            <AppIcon
              name={item.status === "gagal" ? "close-circle-outline" : "checkmark-circle-outline"}
              size={17}
              color={item.status === "gagal" ? colors.red : colors.green}
            />
            <Text style={{ color: item.status === "gagal" ? colors.red : colors.green, fontFamily: fontFamily.bold, fontSize: 14 }}>
              {item.status === "gagal" ? "Pengiriman ini gagal terkirim." : "Pengiriman ini sudah selesai."}
            </Text>
          </View>
        ) : (
          <Text style={[styles.hintText, { color: colors.textMuted }]}>
            Mulai ambil barang lewat aksi "Transit" di halaman Home.
          </Text>
        )}
      </ScrollView>

      <Lightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </SafeAreaView>
  );
}

function DetailField({ label, value, colors }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: fontFamily.bold, letterSpacing: 0.3, marginBottom: 3 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 15, color: colors.text, fontFamily: fontFamily.semiBold }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  topbarTitle: { fontSize: 18, fontFamily: fontFamily.extraBold, flex: 1, textAlign: "center" },
  scroll: { padding: 16, paddingBottom: 60 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  timelineHead: { fontSize: 15.5, fontFamily: fontFamily.bold, marginBottom: 14 },
  timelineItem: { flexDirection: "row", gap: 12 },
  timelineLineWrap: { alignItems: "center" },
  timelineDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  timelineLine: { width: 2, flex: 1, marginVertical: 4, minHeight: 20 },
  timelineLabel: { fontSize: 14, fontFamily: fontFamily.bold },
  timelineTime: { fontSize: 12, marginTop: 2 },
  timelinePhoto: { width: 140, height: 90, borderRadius: 10 },
  doneNote: { borderRadius: radius.md, padding: 16, alignItems: "center" },
  hintText: { fontSize: 12.5, textAlign: "center", paddingVertical: 8 },
  callBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  paymentBox: { borderRadius: radius.md, padding: 14, marginBottom: 14 },
  productPhoto: { width: 100, height: 100, borderRadius: 10 },
});
