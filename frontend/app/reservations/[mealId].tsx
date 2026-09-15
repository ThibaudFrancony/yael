import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { UserAvatar } from "@/src/components/UserAvatar";
import { EmptyState } from "@/src/components/EmptyState";
import { fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import type { Booking } from "@/src/types";

const STATE_LABEL: Record<string, string> = {
  REQUESTED: "En attente",
  ACCEPTED_PENDING_PAYMENT: "Acceptée",
  CONFIRMED: "Confirmée",
  COMPLETED: "Terminée",
  CANCELLED_BY_GUEST: "Annulée (invité)",
  CANCELLED_BY_HOST: "Annulée (hôte)",
};

export default function Reservations() {
  const { mealId } = useLocalSearchParams<{ mealId: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data } = useQuery({
    queryKey: ["reservations", mealId],
    queryFn: () => api.get<{ reservations: Booking[]; remaining: number }>(`/meals/${mealId}/reservations`),
    enabled: !!mealId,
  });
  const list = data?.reservations ?? [];

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable testID="res-back" onPress={() => router.back()} hitSlop={10}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Réservations</Text>
        <View style={{ width: 24 }} />
      </View>
      {data ? (
        <Text style={[styles.remaining, { color: colors.muted }]}>{data.remaining} place(s) restante(s)</Text>
      ) : null}
      <FlatList
        data={list}
        keyExtractor={(b) => b.id}
        contentContainerStyle={list.length === 0 ? { flexGrow: 1, justifyContent: "center" } : { padding: 20, gap: 12 }}
        ListEmptyComponent={<EmptyState icon="users" title="Aucune réservation pour l'instant." testID="res-empty" />}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <UserAvatar url={item.guest.avatar_url} name={item.guest.first_name} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.onSurface }}>{item.guest.first_name}</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.muted }}>{item.guest_count} personne(s)</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: colors.brandTertiary }]}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.onBrandTertiary }}>{STATE_LABEL[item.state] || item.state}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontFamily: fonts.semibold, fontSize: 18 },
  remaining: { fontFamily: fonts.regular, fontSize: 13, paddingHorizontal: 20, paddingTop: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 16, borderWidth: 1 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
});
