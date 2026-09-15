import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { fonts, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { startGoogleLogin } from "@/src/auth/oauth";
import { useToast } from "@/src/components/Toast";

const HERO =
  "https://images.unsplash.com/photo-1699730148132-1409a3728479?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function Welcome() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { loginWithToken } = useAuth();
  const toast = useToast();
  const [googleLoading, setGoogleLoading] = useState(false);

  const onGoogle = async () => {
    setGoogleLoading(true);
    try {
      await startGoogleLogin(async (token, user) => {
        await loginWithToken(token, user);
      });
    } catch {
      toast.show("Connexion Google impossible pour le moment.", "error");
    } finally {
      setGoogleLoading(false);
    }
  };

  const onApple = () => {
    if (Platform.OS === "ios") {
      toast.show("Connexion Apple disponible dans l'app iOS installée.", "info");
    } else {
      toast.show("Connexion Apple disponible sur iPhone.", "info");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={styles.heroWrap}>
        <Image source={{ uri: HERO }} style={styles.hero} contentFit="cover" />
        <LinearGradient colors={["rgba(29,0,59,0.15)", "rgba(29,0,59,0.55)"]} style={StyleSheet.absoluteFill} />
      </View>

      <ScrollView
        style={styles.panel}
        contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.logoImg}
            contentFit="cover"
            testID="brand-logo"
          />
        </View>

        <Text style={[styles.title, { color: colors.onSurface }]}>Bienvenue sur Buddiz</Text>
        <Text style={[styles.tagline, { color: colors.muted }]}>
          Partagez des repas, rencontrez des amis et découvrez de nouvelles personnes.
        </Text>

        <View style={{ gap: 12, marginTop: 28 }}>
          <Pressable
            testID="auth-apple-button"
            onPress={onApple}
            style={({ pressed }) => [styles.btn, { backgroundColor: colors.brandPrimary, opacity: pressed ? 0.9 : 1 }]}
          >
            <Icon name="smartphone" size={18} color={colors.onBrandPrimary} />
            <Text style={[styles.btnText, { color: colors.onBrandPrimary }]}>Continuer avec Apple</Text>
          </Pressable>

          <Pressable
            testID="auth-google-button"
            onPress={onGoogle}
            disabled={googleLoading}
            style={({ pressed }) => [
              styles.btn,
              styles.btnOutline,
              { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Icon name="chrome" size={18} color={colors.onSurface} />
            <Text style={[styles.btnText, { color: colors.onSurface }]}>
              {googleLoading ? "Connexion..." : "Continuer avec Google"}
            </Text>
          </Pressable>

          <Pressable
            testID="auth-email-button"
            onPress={() => router.push("/(auth)/login")}
            style={({ pressed }) => [
              styles.btn,
              styles.btnOutline,
              { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Icon name="mail" size={18} color={colors.onSurface} />
            <Text style={[styles.btnText, { color: colors.onSurface }]}>Continuer avec email</Text>
          </Pressable>
        </View>

        <Pressable
          testID="welcome-register-link"
          onPress={() => router.push("/(auth)/register")}
          style={{ marginTop: 24, alignItems: "center" }}
        >
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.muted }}>
            Pas encore de compte ?{" "}
            <Text style={{ fontFamily: fonts.semibold, color: colors.onBrandTertiary }}>Créer un compte</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  heroWrap: { height: "42%", width: "100%" },
  hero: { width: "100%", height: "100%" },
  panel: {
    flex: 1,
    marginTop: -28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#F9FAFB",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  logoImg: { width: 76, height: 76, borderRadius: 20 },
  logo: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  brand: { fontFamily: fonts.bold, fontSize: 24 },
  title: { fontFamily: fonts.bold, fontSize: 26 },
  tagline: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, marginTop: 8 },
  btn: {
    height: 54,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  btnOutline: { borderWidth: 1 },
  btnText: { fontFamily: fonts.semibold, fontSize: 16 },
});
