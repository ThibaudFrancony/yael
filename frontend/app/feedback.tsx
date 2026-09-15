import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { Icon } from "@/src/components/Icon";
import { TextField } from "@/src/components/TextField";
import { AppButton } from "@/src/components/AppButton";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/api/client";
import { fonts, useTheme } from "@/src/theme";

const OPTIONS = [
  "Interface intuitive",
  "Communauté sympa",
  "Facile à utiliser",
  "Expérience sécurisée",
  "Bonnes fonctionnalités",
  "Améliorer les filtres",
];

export default function FeedbackScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const toggle = (o: string) =>
    setSelected((s) => (s.includes(o) ? s.filter((x) => x !== o) : [...s, o]));

  const mutation = useMutation({
    mutationFn: () => api.post("/feedback", { rating: rating || null, options: selected, message: message.trim() || null }),
    onSuccess: () => {
      toast.show("Merci pour ton avis ! 💛", "success");
      router.back();
    },
    onError: (e: any) => toast.show(e?.message || "Erreur", "error"),
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="feedback-back" onPress={() => router.back()} hitSlop={8}>
          <Icon name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Donner ton avis</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Text style={[styles.title, { color: colors.onSurface }]}>Ton avis sur Buddiz</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>{"Aide-nous à améliorer l'expérience."}</Text>

        <Text style={[styles.label, { color: colors.onSurface, marginTop: 24 }]}>Note globale</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} testID={`fb-star-${n}`} onPress={() => setRating(n)} hitSlop={6}>
              <Icon name="star" size={34} color={n <= rating ? colors.brandSecondary : colors.borderStrong} />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.onSurface, marginTop: 24 }]}>{"Qu'est-ce que tu apprécies ?"}</Text>
        <View style={styles.chips}>
          {OPTIONS.map((o) => {
            const on = selected.includes(o);
            return (
              <Pressable
                key={o}
                testID={`fb-opt-${o}`}
                onPress={() => toggle(o)}
                style={[styles.chip, { backgroundColor: on ? colors.brandPrimary : colors.surfaceTertiary, borderColor: on ? colors.brandPrimary : colors.border }]}
              >
                <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: on ? colors.onBrandPrimary : colors.onSurfaceTertiary }}>{o}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 24 }}>
          <TextField
            label="Message (optionnel)"
            testID="fb-message"
            value={message}
            onChangeText={setMessage}
            placeholder="Partage tes idées..."
            multiline
            numberOfLines={4}
            style={{ height: 110, textAlignVertical: "top", paddingTop: 12 }}
          />
        </View>

        <View style={{ marginTop: 24 }}>
          <AppButton testID="fb-submit" title="Envoyer mon avis" loading={mutation.isPending} onPress={() => mutation.mutate()} />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontFamily: fonts.semibold, fontSize: 17 },
  title: { fontFamily: fonts.bold, fontSize: 24 },
  sub: { fontFamily: fonts.regular, fontSize: 14, marginTop: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  label: { fontFamily: fonts.medium, fontSize: 14, marginBottom: 12 },
});
