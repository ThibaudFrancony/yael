import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Platform } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { Icon } from "@/src/components/Icon";
import { EmptyState } from "@/src/components/EmptyState";
import { fonts, useTheme } from "@/src/theme";
import { api, resolveImage } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { formatEuroCents, formatDateShort } from "@/src/lib/format";

type Item = {
  booking_id: string; meal_title: string; meal_image?: string; date?: string;
  guest_first_name: string; guest_count: number; gross_cents: number; fee_cents: number;
  net_cents: number; refunded: boolean; refund_cents: number;
};
type Earnings = {
  summary: { net_earnings_cents: number; buddiz_fees_cents: number; gross_cents: number; paid_count: number; refunded_count: number; refunded_cents: number };
  items: Item[];
};

export default function EarningsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const { data, isLoading } = useQuery({ queryKey: ["earnings"], queryFn: () => api.get<Earnings>("/host/earnings") });
  const { data: connect } = useQuery({ queryKey: ["connect-status"], queryFn: () => api.get<{ ready?: boolean }>("/connect/status") });
  const s = data?.summary;

  const openDashboard = async () => {
    try {
      const res = await api.get<{ url: string }>("/connect/dashboard");
      if (Platform.OS === "web") window.open(res.url, "_blank");
      else await WebBrowser.openBrowserAsync(res.url);
    } catch (e: any) {
      toast.show(e?.message || "Tableau de bord indisponible.", "error");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable testID="earnings-back" onPress={() => router.back()} hitSlop={10}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Mes versements</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={data?.items ?? []}
        keyExtractor={(i) => i.booking_id}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Hero net earnings */}
            <View style={[styles.hero, { backgroundColor: colors.brandPrimary }]}>
              <Text style={styles.heroLabel}>Gains nets encaissés</Text>
              <Text style={styles.heroValue}>{formatEuroCents(s?.net_earnings_cents ?? 0)}</Text>
              <Text style={styles.heroSub}>{s?.paid_count ?? 0} réservation(s) payée(s)</Text>
            </View>

            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              <MiniCard label="Commission Buddiz (10%)" value={formatEuroCents(s?.buddiz_fees_cents ?? 0)} colors={colors} />
              <MiniCard label="Total encaissé (brut)" value={formatEuroCents(s?.gross_cents ?? 0)} colors={colors} />
            </View>
            {(s?.refunded_cents ?? 0) > 0 ? (
              <View style={[styles.refundNote, { backgroundColor: colors.surfaceTertiary }]}>
                <Icon name="corner-up-left" size={16} color={colors.muted} />
                <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.onSurfaceTertiary, flex: 1 }}>
                  {s?.refunded_count} remboursement(s) · {formatEuroCents(s?.refunded_cents ?? 0)}
                </Text>
              </View>
            ) : null}

            {connect?.ready ? (
              <Pressable testID="open-stripe-dashboard" onPress={openDashboard} style={[styles.dash, { borderColor: colors.border }]}>
                <Icon name="external-link" size={18} color={colors.onSurface} />
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.onSurface, flex: 1 }}>
                  Ouvrir mon tableau de bord Stripe
                </Text>
                <Icon name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            ) : (
              <View style={[styles.refundNote, { backgroundColor: colors.brandTertiary }]}>
                <Icon name="info" size={16} color={colors.onBrandTertiary} />
                <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.onBrandTertiary, flex: 1 }}>
                  {"Configure tes versements dans le profil pour recevoir l'argent sur ton compte."}
                </Text>
              </View>
            )}

            <Text style={[styles.section, { color: colors.onSurface }]}>Détail par repas</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Image source={{ uri: resolveImage(item.meal_image) }} style={styles.rowImg} contentFit="cover" transition={150} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.onSurface }} numberOfLines={1}>{item.meal_title}</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 }}>
                {formatDateShort(item.date)} · {item.guest_first_name} · {item.guest_count} pers.
              </Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 }}>
                Brut {formatEuroCents(item.gross_cents)} − commission {formatEuroCents(item.fee_cents)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: item.refunded ? colors.muted : colors.success }}>
                {item.refunded ? "—" : `+${formatEuroCents(item.net_cents)}`}
              </Text>
              <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: item.refunded ? colors.error : colors.success, marginTop: 2 }}>
                {item.refunded ? "Remboursé" : "Reversé"}
              </Text>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          !isLoading ? <EmptyState icon="dollar-sign" title="Aucun gain pour le moment." subtitle="Tes versements apparaîtront ici après tes premiers repas payés." testID="earnings-empty" /> : null
        }
      />
    </View>
  );
}

function MiniCard({ label, value, colors }: any) {
  return (
    <View style={[styles.mini, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>{label}</Text>
      <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.onSurface, marginTop: 6 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontFamily: fonts.semibold, fontSize: 18 },
  hero: { borderRadius: 20, padding: 20 },
  heroLabel: { fontFamily: fonts.medium, fontSize: 13, color: "rgba(255,255,255,0.75)" },
  heroValue: { fontFamily: fonts.bold, fontSize: 36, color: "#FFFFFF", marginTop: 6 },
  heroSub: { fontFamily: fonts.regular, fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 4 },
  mini: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 14 },
  refundNote: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, marginTop: 12 },
  dash: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginTop: 12 },
  section: { fontFamily: fonts.semibold, fontSize: 17, marginTop: 24, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1 },
  rowImg: { width: 52, height: 52, borderRadius: 12, backgroundColor: "#EEE" },
});
