import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { AppButton } from "@/src/components/AppButton";
import { fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { formatEuroCents } from "@/src/lib/format";
import type { AppConfig, Booking } from "@/src/types";

export default function Payment() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: () => api.get<{ booking: Booking }>(`/bookings/${bookingId}`),
    enabled: !!bookingId,
  });
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: () => api.get<AppConfig>("/config") });
  const b = data?.booking;

  const changeCount = async (delta: number) => {
    if (!b) return;
    const next = b.guest_count + delta;
    if (next < 1) return;
    try {
      await api.post(`/bookings/${bookingId}/guest-count`, { guest_count: next });
      refetch();
    } catch (e: any) {
      toast.show(e?.message || "Modification impossible.", "error");
    }
  };

  const pay = async () => {
    if (!b) return;
    setPaying(true);
    try {
      const res = await api.post<{ test_mode: boolean; checkout_url?: string }>("/payments/checkout", { booking_id: bookingId });
      if (res.test_mode) {
        await api.post("/payments/confirm-test", { booking_id: bookingId });
        qc.invalidateQueries({ queryKey: ["my-bookings"] });
        qc.invalidateQueries({ queryKey: ["meals"] });
        router.replace(`/payment-success?booking_id=${bookingId}`);
        return;
      }
      if (res.checkout_url) {
        if (Platform.OS === "web") {
          window.location.assign(res.checkout_url);
        } else {
          await WebBrowser.openBrowserAsync(res.checkout_url);
          // Verify the session server-side after the user returns (no webhook).
          for (let i = 0; i < 8; i++) {
            const v = await api.post<{ confirmed: boolean }>("/payments/verify", { booking_id: bookingId });
            if (v.confirmed) {
              qc.invalidateQueries({ queryKey: ["my-bookings"] });
              qc.invalidateQueries({ queryKey: ["meals"] });
              router.replace(`/payment-success?booking_id=${bookingId}`);
              return;
            }
            await new Promise((r) => setTimeout(r, 1500));
          }
          toast.show("Paiement non confirmé. Si tu as payé, réessaie dans un instant.", "info");
        }
      }
    } catch (e: any) {
      toast.show(e?.message || "Paiement impossible.", "error");
    } finally {
      setPaying(false);
    }
  };

  if (!b) {
    return <View style={[styles.root, { backgroundColor: colors.surface }]} />;
  }

  const policy = config?.cancellation_policy;

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable testID="payment-back" onPress={() => router.back()} hitSlop={10}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Paiement</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <Text style={[styles.mealTitle, { color: colors.onSurface }]}>{b.meal?.title}</Text>
        <Text style={[styles.mealSub, { color: colors.muted }]}>Préparé par {b.meal?.host.first_name} · {b.meal?.city}</Text>

        {/* Guests */}
        <Text style={[styles.section, { color: colors.onSurface }]}>Détails invités</Text>
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
          <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.onSurface }}>Nombre de personnes</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Pressable testID="guest-minus" onPress={() => changeCount(-1)} style={[styles.counterBtn, { borderColor: colors.border }]}>
              <Icon name="minus" size={16} color={colors.onSurface} />
            </Pressable>
            <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.onSurface, minWidth: 20, textAlign: "center" }}>{b.guest_count}</Text>
            <Pressable testID="guest-plus" onPress={() => changeCount(1)} style={[styles.counterBtn, { borderColor: colors.border }]}>
              <Icon name="plus" size={16} color={colors.onSurface} />
            </Pressable>
          </View>
        </View>

        {/* Order */}
        <Text style={[styles.section, { color: colors.onSurface }]}>Commande</Text>
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Line label={`Repas (${b.guest_count} × ${formatEuroCents((b.meal?.price_cents) || 0)})`} value={formatEuroCents(b.subtotal_cents)} colors={colors} />
          <Line label={`Frais de service Buddiz (${b.meal?.service_fee_percent}%)`} value={formatEuroCents(b.service_fee_cents)} colors={colors} />
          <View style={[styles.hr, { backgroundColor: colors.divider }]} />
          <Line label="Total" value={formatEuroCents(b.total_cents)} bold colors={colors} />
        </View>

        {/* Cancellation policy */}
        <Text style={[styles.section, { color: colors.onSurface }]}>Politique d&apos;annulation</Text>
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.onSurfaceTertiary, lineHeight: 21 }}>
            Annulation ≥ {policy?.full_refund_hours ?? 24}h avant le repas : remboursement intégral.{"\n"}
            Moins de {policy?.full_refund_hours ?? 24}h avant : remboursement de {policy?.partial_refund_percent ?? 50}%.
          </Text>
        </View>

        {/* Secure */}
        <View style={[styles.secure, { backgroundColor: colors.brandTertiary }]}>
          <Icon name="lock" size={16} color={colors.onBrandTertiary} />
          <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.onBrandTertiary, flex: 1 }}>
            {config?.payments_test_mode
              ? "Mode démo : Stripe non configuré. Ajoute tes clés pour activer le vrai paiement."
              : "Paiement sécurisé traité par Stripe. Aucune donnée de carte n'est stockée par Buddiz."}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14, borderTopColor: colors.border }]}>
        <AppButton
          testID="pay-button"
          title={`Payer ${formatEuroCents(b.total_cents)}`}
          onPress={pay}
          loading={paying}
        />
      </View>
    </View>
  );
}

function Line({ label, value, bold, colors }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 4 }}>
      <Text style={{ fontFamily: bold ? fonts.semibold : fonts.regular, fontSize: bold ? 16 : 14, color: bold ? colors.onSurface : colors.onSurfaceTertiary }}>{label}</Text>
      <Text style={{ fontFamily: bold ? fonts.bold : fonts.medium, fontSize: bold ? 18 : 14, color: colors.onSurface }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontFamily: fonts.semibold, fontSize: 18 },
  mealTitle: { fontFamily: fonts.bold, fontSize: 22 },
  mealSub: { fontFamily: fonts.regular, fontSize: 14, marginTop: 4 },
  section: { fontFamily: fonts.semibold, fontSize: 16, marginTop: 24, marginBottom: 10 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  counterBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  secure: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, marginTop: 24 },
  footer: { paddingHorizontal: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
});
