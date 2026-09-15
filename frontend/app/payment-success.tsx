import React, { useEffect } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { AppButton } from "@/src/components/AppButton";
import { fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { formatEuroCents, formatDateLong, formatTime } from "@/src/lib/format";
import type { Booking } from "@/src/types";

export default function PaymentSuccess() {
  const { booking_id } = useLocalSearchParams<{ booking_id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["booking", booking_id],
    queryFn: () => api.get<{ booking: Booking }>(`/bookings/${booking_id}`),
    enabled: !!booking_id,
    refetchInterval: (q) => ((q.state.data as any)?.booking?.state === "CONFIRMED" ? false : 2000),
  });
  const b = data?.booking;
  const confirmed = b?.state === "CONFIRMED" || b?.state === "COMPLETED";

  // No Stripe webhook configured → verify the Checkout session server-side.
  useEffect(() => {
    if (!booking_id || confirmed) return;
    let active = true;
    (async () => {
      for (let i = 0; i < 10 && active; i++) {
        try {
          const v = await api.post<{ confirmed: boolean }>("/payments/verify", { booking_id });
          if (v.confirmed) {
            qc.invalidateQueries({ queryKey: ["booking", booking_id] });
            qc.invalidateQueries({ queryKey: ["my-bookings"] });
            qc.invalidateQueries({ queryKey: ["meals"] });
            return;
          }
        } catch {
          /* ignore, retry */
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    })();
    return () => {
      active = false;
    };
  }, [booking_id, confirmed, qc]);

  const steps = [
    "Confirmation de la réservation",
    "Tu peux contacter l'hôte à tout moment",
    "Arrive à l'heure indiquée",
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: "center" }}>
          <View style={[styles.check, { backgroundColor: confirmed ? colors.success : colors.warning }]}>
            <Icon name={confirmed ? "check" : "clock"} size={40} color="#FFFFFF" />
          </View>
          <Text style={[styles.title, { color: colors.onSurface }]}>
            {confirmed ? "Réservation confirmée ! 🎉" : "Paiement en cours..."}
          </Text>
          <Text style={[styles.sub, { color: colors.muted }]}>
            {confirmed ? "Ton repas est réservé. À très vite !" : "Nous confirmons ton paiement, un instant."}
          </Text>
        </View>

        {b ? (
          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Row icon="coffee" label="Repas" value={b.meal?.title || ""} colors={colors} />
            <Row icon="calendar" label="Date" value={formatDateLong(b.meal?.starts_at)} colors={colors} />
            <Row icon="clock" label="Heure" value={formatTime(b.meal?.starts_at)} colors={colors} />
            <Row icon="users" label="Invités" value={`${b.guest_count} personne(s)`} colors={colors} />
            <Row icon="tag" label="Total payé" value={formatEuroCents(b.total_cents)} colors={colors} />
            <Row icon="user" label="Hôte" value={b.meal?.host.first_name || ""} colors={colors} />
            <Row
              icon="map-pin"
              label="Adresse"
              value={confirmed && b.meal?.exact_address ? b.meal.exact_address : "En attente de confirmation"}
              colors={colors}
              highlight={confirmed && !!b.meal?.exact_address}
            />
          </View>
        ) : null}

        <Text style={[styles.section, { color: colors.onSurface }]}>Prochaines étapes</Text>
        <View style={{ gap: 10 }}>
          {steps.map((s, i) => (
            <View key={i} style={[styles.step, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <View style={[styles.stepNum, { backgroundColor: colors.brandTertiary }]}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.onBrandTertiary }}>{i + 1}</Text>
              </View>
              <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.onSurface, flex: 1 }}>{s}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: 12, marginTop: 24 }}>
          {b?.conversation_id ? (
            <AppButton testID="contact-host-button" title="Contacter l'hôte" variant="accent" onPress={() => router.replace(`/conversation/${b.conversation_id}`)} />
          ) : null}
          <AppButton testID="see-bookings-button" title="Voir mes réservations" variant="secondary" onPress={() => router.replace("/(tabs)/profile")} />
          <AppButton testID="back-home-button" title="Retour à l'accueil" onPress={() => router.replace("/(tabs)")} />
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, value, colors, highlight }: any) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: colors.brandTertiary }]}>
        <Icon name={icon} size={15} color={colors.onBrandTertiary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>{label}</Text>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: highlight ? colors.onBrandTertiary : colors.onSurface, marginTop: 1 }}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  check: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.bold, fontSize: 24, marginTop: 20, textAlign: "center" },
  sub: { fontFamily: fonts.regular, fontSize: 15, marginTop: 8, textAlign: "center" },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginTop: 28, gap: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  section: { fontFamily: fonts.semibold, fontSize: 17, marginTop: 28, marginBottom: 12 },
  step: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});
