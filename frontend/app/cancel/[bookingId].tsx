import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { TextField } from "@/src/components/TextField";
import { AppButton } from "@/src/components/AppButton";
import { fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { formatEuroCents } from "@/src/lib/format";
import type { AppConfig, Booking } from "@/src/types";

const REASONS = ["Changement de planning", "Urgence personnelle", "Raison de santé", "Problème de transport", "Autre raison"];

export default function CancelBooking() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["booking", bookingId], queryFn: () => api.get<{ booking: Booking }>(`/bookings/${bookingId}`), enabled: !!bookingId });
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: () => api.get<AppConfig>("/config") });
  const b = data?.booking;
  const policy = config?.cancellation_policy;

  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (!reason) return toast.show("Choisis une raison.", "error");
    setSaving(true);
    try {
      const res = await api.post<{ refund_cents: number }>(`/bookings/${bookingId}/cancel`, { reason, message: message.trim() || undefined });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      qc.invalidateQueries({ queryKey: ["meals"] });
      toast.show(res.refund_cents > 0 ? `Annulée. Remboursement : ${formatEuroCents(res.refund_cents)}` : "Réservation annulée.", "success");
      router.back();
    } catch (e: any) {
      toast.show(e?.message || "Annulation impossible.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable testID="cancel-back" onPress={() => router.back()} hitSlop={10}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Annuler la réservation</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        {b ? (
          <View style={[styles.mealBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.onSurface }}>{b.meal?.title}</Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 4 }}>
              {b.guest_count} personne(s) · {formatEuroCents(b.total_cents)}
            </Text>
          </View>
        ) : null}

        <View style={[styles.warn, { backgroundColor: colors.brandTertiary }]}>
          <Icon name="alert-triangle" size={16} color={colors.onBrandTertiary} />
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.onBrandTertiary, flex: 1, lineHeight: 19 }}>
            Annulation ≥ {policy?.full_refund_hours ?? 24}h avant : remboursement intégral. Moins de {policy?.full_refund_hours ?? 24}h : {policy?.partial_refund_percent ?? 50}%. Cette action est irréversible.
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.onSurface }]}>Raison de l&apos;annulation</Text>
        <View style={{ gap: 10 }}>
          {REASONS.map((r) => (
            <Pressable
              key={r}
              testID={`reason-${r}`}
              onPress={() => setReason(r)}
              style={[styles.reason, { backgroundColor: colors.surfaceSecondary, borderColor: reason === r ? colors.brandSecondary : colors.border }]}
            >
              <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.onSurface }}>{r}</Text>
              <Icon name={reason === r ? "check-circle" : "circle"} size={20} color={reason === r ? colors.brandSecondary : colors.border} />
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: 16 }}>
          <TextField testID="cancel-message" label="Message (optionnel)" value={message} onChangeText={setMessage} placeholder="Un mot pour l'hôte..." multiline style={{ height: 90, textAlignVertical: "top", paddingTop: 12 }} />
        </View>

        <View style={{ marginTop: 20 }}>
          <AppButton testID="confirm-cancel-button" title="Confirmer l'annulation" onPress={confirm} loading={saving} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontFamily: fonts.semibold, fontSize: 18 },
  mealBox: { borderRadius: 16, borderWidth: 1, padding: 16 },
  warn: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, marginTop: 16 },
  label: { fontFamily: fonts.semibold, fontSize: 16, marginTop: 24, marginBottom: 12 },
  reason: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderRadius: 14, borderWidth: 1 },
});
