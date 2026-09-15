import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { TextField } from "@/src/components/TextField";
import { AppButton } from "@/src/components/AppButton";
import { UserAvatar } from "@/src/components/UserAvatar";
import { fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import type { Booking } from "@/src/types";

const CATEGORIES = ["Hospitalité", "Nourriture", "Conversation", "Ambiance"];

function Stars({ value, onChange, size = 34, testID }: { value: number; onChange: (v: number) => void; size?: number; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 8 }} testID={testID}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Pressable key={s} testID={`${testID}-${s}`} onPress={() => onChange(s)} hitSlop={4}>
          <Icon name="star" size={size} color={s <= value ? colors.brandSecondary : colors.border} />
        </Pressable>
      ))}
    </View>
  );
}

export default function Review() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: () => api.get<{ booking: Booking }>(`/bookings/${bookingId}`),
    enabled: !!bookingId,
  });
  const b = data?.booking;

  const [overall, setOverall] = useState(0);
  const [cats, setCats] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (overall < 1) return toast.show("Attribue une note globale.", "error");
    setSaving(true);
    try {
      await api.post("/reviews", { booking_id: bookingId, overall, categories: cats, comment: comment.trim() || undefined });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      qc.invalidateQueries({ queryKey: ["meals"] });
      toast.show("Merci pour ton avis !", "success");
      router.back();
    } catch (e: any) {
      toast.show(e?.message || "Impossible d'envoyer l'avis.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable testID="review-back" onPress={() => router.back()} hitSlop={10}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Évaluer</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <UserAvatar url={b?.meal?.host.avatar_url} name={b?.meal?.host.first_name} size={72} />
          <Text style={[styles.host, { color: colors.onSurface }]}>{b?.meal?.host.first_name}</Text>
          <Text style={[styles.meal, { color: colors.muted }]}>{b?.meal?.title}</Text>
        </View>

        <Text style={[styles.label, { color: colors.onSurface }]}>Note globale</Text>
        <View style={{ alignItems: "center", marginVertical: 12 }}>
          <Stars value={overall} onChange={setOverall} testID="overall-stars" />
        </View>

        <Text style={[styles.label, { color: colors.onSurface, marginTop: 12 }]}>Par catégorie</Text>
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          {CATEGORIES.map((c, i) => (
            <View key={c} style={[styles.catRow, i < CATEGORIES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.onSurface }}>{c}</Text>
              <Stars value={cats[c] || 0} onChange={(v) => setCats((p) => ({ ...p, [c]: v }))} size={22} testID={`cat-${c}`} />
            </View>
          ))}
        </View>

        <View style={{ marginTop: 20 }}>
          <TextField
            testID="review-comment"
            label="Ton commentaire"
            value={comment}
            onChangeText={setComment}
            placeholder="Raconte ton expérience..."
            multiline
            style={{ height: 120, textAlignVertical: "top", paddingTop: 12 }}
          />
        </View>

        <View style={{ marginTop: 20 }}>
          <AppButton testID="submit-review-button" title="Publier mon avis" onPress={submit} loading={saving} />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontFamily: fonts.semibold, fontSize: 18 },
  host: { fontFamily: fonts.bold, fontSize: 20, marginTop: 12 },
  meal: { fontFamily: fonts.regular, fontSize: 14, marginTop: 4 },
  label: { fontFamily: fonts.semibold, fontSize: 16 },
  card: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, marginTop: 12 },
  catRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
});
