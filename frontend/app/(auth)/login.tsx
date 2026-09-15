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

export default function Login() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      toast.show("Renseigne ton email et ton mot de passe.", "error");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      // gate redirects automatically
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Connexion impossible.";
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

        <Text style={[styles.title, { color: colors.onSurface }]}>Content de te revoir</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>Connecte-toi pour continuer sur Buddiz.</Text>

        <View style={{ gap: 16, marginTop: 28 }}>
          <TextField
            testID="login-email-input"
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="ton@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <TextField
            testID="login-password-input"
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
          />
          <AppButton testID="login-submit-button" title="Se connecter" onPress={onSubmit} loading={loading} />
        </View>

        <Pressable
          testID="go-register-link"
          onPress={() => router.replace("/(auth)/register")}
          style={{ marginTop: 24, alignItems: "center" }}
        >
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.muted }}>
            Pas encore de compte ?{" "}
            <Text style={{ fontFamily: fonts.semibold, color: colors.onBrandTertiary }}>Créer un compte</Text>
          </Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  back: { marginBottom: 20 },
  title: { fontFamily: fonts.bold, fontSize: 26 },
  sub: { fontFamily: fonts.regular, fontSize: 15, marginTop: 6 },
});
