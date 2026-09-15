import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { TextField } from "@/src/components/TextField";
import { AppButton } from "@/src/components/AppButton";
import { fonts, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { useToast } from "@/src/components/Toast";
import { ApiError } from "@/src/api/client";

export default function Register() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    city: "",
    phone: "",
  });
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.show("Renseigne ton prénom et ton nom.", "error");
      return;
    }
    if (!form.email.trim() || !form.email.includes("@")) {
      toast.show("Email invalide.", "error");
      return;
    }
    if (form.password.length < 6) {
      toast.show("Le mot de passe doit faire au moins 6 caractères.", "error");
      return;
    }
    if (!form.city.trim() || !form.phone.trim()) {
      toast.show("Renseigne ta ville et ton numéro de téléphone.", "error");
      return;
    }
    setLoading(true);
    try {
      await register({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        password: form.password,
        city: form.city.trim(),
        phone: form.phone.trim(),
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Inscription impossible.";
      toast.show(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 24, paddingTop: insets.top + 12, paddingBottom: 40 }}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        <Pressable testID="back-button" onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>

        <Text style={[styles.title, { color: colors.onSurface }]}>Créer ton compte</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>
          Rejoins la communauté Buddiz et partage des repas près de chez toi.
        </Text>

        <View style={{ gap: 16, marginTop: 24 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <TextField testID="register-firstname-input" label="Prénom" value={form.first_name} onChangeText={set("first_name")} placeholder="Marie" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField testID="register-lastname-input" label="Nom" value={form.last_name} onChangeText={set("last_name")} placeholder="Dupont" />
            </View>
          </View>
          <TextField
            testID="register-email-input"
            label="Email"
            value={form.email}
            onChangeText={set("email")}
            placeholder="ton@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <TextField
            testID="register-password-input"
            label="Mot de passe"
            value={form.password}
            onChangeText={set("password")}
            placeholder="Au moins 6 caractères"
            secureTextEntry
          />
          <TextField testID="register-city-input" label="Ville" value={form.city} onChangeText={set("city")} placeholder="Paris" />
          <TextField
            testID="register-phone-input"
            label="Téléphone"
            value={form.phone}
            onChangeText={set("phone")}
            placeholder="+33 6 12 34 56 78"
            keyboardType="phone-pad"
          />
          <AppButton testID="register-submit-button" title="Créer mon compte" onPress={onSubmit} loading={loading} />
        </View>

        <Pressable
          testID="go-login-link"
          onPress={() => router.replace("/(auth)/login")}
          style={{ marginTop: 20, alignItems: "center" }}
        >
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.muted }}>
            Déjà un compte ?{" "}
            <Text style={{ fontFamily: fonts.semibold, color: colors.onBrandTertiary }}>Se connecter</Text>
          </Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  back: { marginBottom: 16 },
  title: { fontFamily: fonts.bold, fontSize: 26 },
  sub: { fontFamily: fonts.regular, fontSize: 15, marginTop: 6, lineHeight: 21 },
});
