import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { EmptyState } from "@/src/components/EmptyState";
import { fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { formatDateShort, formatTime } from "@/src/lib/format";
import type { AppNotification } from "@/src/types";

const ICON: Record<string, any> = {
  booking_request: "calendar",
  booking_accepted: "check-circle",
  payment_confirmed: "check-circle",
  new_message: "message-circle",
  booking_cancelled: "x-circle",
  meal_cancelled: "alert-triangle",
  booking_declined: "x-circle",
  review_request: "star",
};

export default function Notifications() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ notifications: AppNotification[]; unread: number }>("/notifications"),
    refetchInterval: 6000,
  });
  const notifs = data?.notifications ?? [];

  const markAll = async () => {
    await api.post("/notifications/read-all");
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["unread-count"] });
  };

  const open = (n: AppNotification) => {
    if (n.conversation_id) router.push(`/conversation/${n.conversation_id}`);
    else if (n.booking_id) router.push(`/payment-success?booking_id=${n.booking_id}`);
    else if (n.meal_id) router.push(`/meal/${n.meal_id}`);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable testID="notif-back" onPress={() => router.back()} hitSlop={10}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Notifications</Text>
        <Pressable testID="mark-all-read" onPress={markAll} hitSlop={8}>
          <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.onBrandTertiary }}>Tout marquer comme lu</Text>
        </Pressable>
      </View>

      <FlatList
        data={notifs}
        keyExtractor={(n) => n.id}
        contentContainerStyle={notifs.length === 0 ? { flexGrow: 1, justifyContent: "center" } : { paddingVertical: 8 }}
        ListEmptyComponent={<EmptyState icon="bell" title="Aucune notification pour le moment." testID="notif-empty" />}
        renderItem={({ item }) => (
          <Pressable testID={`notif-${item.id}`} onPress={() => open(item)} style={[styles.row, !item.read && { backgroundColor: colors.brandTertiary }]}>
            <View style={[styles.icon, { backgroundColor: colors.surfaceSecondary }]}>
              <Icon name={ICON[item.type] || "bell"} size={18} color={colors.onBrandTertiary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.nTitle, { color: colors.onSurface }]}>{item.title}</Text>
              <Text style={[styles.nBody, { color: colors.muted }]} numberOfLines={2}>{item.body}</Text>
              <Text style={[styles.nTime, { color: colors.muted }]}>
                {item.created_at ? `${formatDateShort(item.created_at)} · ${formatTime(item.created_at)}` : ""}
              </Text>
            </View>
            {!item.read ? <View style={[styles.dot, { backgroundColor: colors.brandSecondary }]} /> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontFamily: fonts.semibold, fontSize: 18 },
  row: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 14, alignItems: "center" },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  nTitle: { fontFamily: fonts.semibold, fontSize: 15 },
  nBody: { fontFamily: fonts.regular, fontSize: 13, marginTop: 2, lineHeight: 18 },
  nTime: { fontFamily: fonts.regular, fontSize: 11, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
