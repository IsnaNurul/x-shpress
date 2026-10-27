import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, ScrollView, Platform, Alert, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fontFamily, radius } from "../theme";
import { useApp } from "../context/AppContext";
import AppIcon from "../components/AppIcon";

export default function LoginScreen() {
  const { login } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.message || "Email dan password wajib diisi.");
      }
    } catch (e) {
      Alert.alert("Gagal masuk", "Terjadi kesalahan, silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#78008e" }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.logoWrap}>
              <Image source={require("../../assets/icon.png")} style={styles.logoImage} />
              <Text style={styles.appName}>X-SHPRESS</Text>
              <Text style={styles.tagline}>Masuk untuk mulai tugas pengiriman hari ini</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Email Akun ERP</Text>
              <View style={styles.inputWrap}>
                <AppIcon name="mail-outline" size={18} color="#9a93ad" />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="nama@contoh.com"
                  placeholderTextColor="#9a93ad"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                />
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Password</Text>
              <View style={styles.inputWrap}>
                <AppIcon name="lock-closed-outline" size={18} color="#9a93ad" />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Masukkan password"
                  placeholderTextColor="#9a93ad"
                  secureTextEntry={!showPassword}
                  style={styles.input}
                />
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <AppIcon name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#9a93ad" />
                </TouchableOpacity>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                onPress={handleLogin}
                disabled={submitting}
                activeOpacity={0.85}
                style={[styles.loginBtn, submitting && { opacity: 0.6 }]}
              >
                {submitting ? (
                  <Text style={styles.loginBtnText}>Memproses...</Text>
                ) : (
                  <>
                    <AppIcon name="log-in-outline" size={18} color="#fff" />
                    <Text style={styles.loginBtnText}>Masuk</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.footerNote}>
              Masuk pakai akun ERP asli (email & password). Hubungi admin jika belum punya akun.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24, paddingVertical: 40 },
  logoWrap: { alignItems: "center", marginBottom: 32 },
  logoImage: { width: 84, height: 84, marginBottom: 16 },
  appName: { color: "#fff", fontSize: 24, fontFamily: fontFamily.extraBold },
  tagline: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 6, fontFamily: fontFamily.medium, textAlign: "center" },
  card: { backgroundColor: "#fff", borderRadius: radius.lg, padding: 22 },
  fieldLabel: { fontSize: 12, fontFamily: fontFamily.bold, color: "#6b6280", marginBottom: 6, letterSpacing: 0.2 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: "#ecebf2",
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 4,
    backgroundColor: "#f8f7fb",
  },
  input: { flex: 1, fontSize: 15, fontFamily: fontFamily.regular, color: "#1c1a27", paddingVertical: 12 },
  errorText: { color: "#dc2626", fontSize: 12.5, fontFamily: fontFamily.semiBold, marginTop: 10 },
  loginBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#78008e",
    borderRadius: radius.sm,
    paddingVertical: 15,
    marginTop: 22,
  },
  loginBtnText: { color: "#fff", fontSize: 15, fontFamily: fontFamily.bold },
  footerNote: { color: "rgba(255,255,255,0.75)", fontSize: 12, textAlign: "center", marginTop: 22, fontFamily: fontFamily.medium },
});
