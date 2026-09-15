import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { Icon } from "@/src/components/Icon";
import { AppButton } from "@/src/components/AppButton";
import { fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";

export default function ConnectReturn() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["connect-status"],
    queryFn: () => api.get<{ ready?: boolean; details_submitted?: boolean; payouts_enabled?: boolean }>("/connect/status"),
    refetchInterval: (q) => ((q.state.data as any)?.ready ? false : 3000),
  });
  const ready = data?.ready;

  const resume = async () => {
    const res = await api.post<{ onboarding_url: string }>("/connect/account", {});
    if (Platform.OS === "web") window.location.assign(res.onboarding_url);
    else await WebBrowser.openBrowserAsync(res.onboarding_url);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      <View style={[styles.icon, { backgroundColor: ready ? colors.success : colors.brandTertiary }]}>
        <Icon name={ready ? "check" : "clock"} size={40} color={ready ? "#FFFFFF" : colors.onBrandTertiary} />
      </View>
      <Text style={[styles.title, { color: colors.onSurface }]}>
        {isLoading ? "Vérification..." : ready ? "Versements activés !" : "Configuration incomplète"}
      </Text>
      <Text style={[styles.sub, { color: colors.muted }]}>
        {ready
          ? "Ton compte est prêt. Tu recevras l'argent de tes repas directement sur ton compte bancaire."
          : "Stripe a encore besoin d'informations avant de pouvoir te verser l'argent."}
      </Text>
      <View style={{ height: 28 }} />
      {!ready ? (
        <AppButton testID="resume-onboarding" title="Reprendre la configuration" onPress={resume} />
      ) : null}
      <View style={{ height: 12 }} />
      <AppButton testID="connect-return-profile" title="Retour au profil" variant="secondary" onPress={() => router.replace("/(tabs)/profile")} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  icon: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.bold, fontSize: 24, marginTop: 22, textAlign: "center" },
  sub: { fontFamily: fonts.regular, fontSize: 15, marginTop: 10, textAlign: "center", lineHeight: 22 },
});
