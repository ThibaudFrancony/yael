import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/src/components/UserAvatar";
import { EmptyState } from "@/src/components/EmptyState";
import { fonts, useTheme } from "@/src/theme";
import { api, resolveImage } from "@/src/api/client";
import { formatTime, formatDateShort } from "@/src/lib/format";
import type { Conversation } from "@/src/types";

export default function Messages() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.get<{ conversations: Conversation[] }>("/conversations"),
    refetchInterval: 5000,
  });
  const convs = data?.conversations ?? [];

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Messages</Text>
      </View>
      <FlatList
        data={convs}
        keyExtractor={(c) => c.id}
        contentContainerStyle={convs.length === 0 ? { flexGrow: 1, justifyContent: "center" } : { paddingVertical: 8 }}
        ListEmptyComponent={
          <EmptyState
            icon="message-circle"
            title="Tu n'as pas encore de conversation."
            subtitle="Contacte un hôte depuis un repas pour démarrer une discussion."
            testID="messages-empty"
          />
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`conversation-${item.id}`}
            onPress={() => router.push(`/conversation/${item.id}`)}
            style={styles.row}
          >
            <View style={styles.avatarWrap}>
              {item.meal_image ? (
                <Image source={{ uri: resolveImage(item.meal_image) }} style={styles.thumb} contentFit="cover" />
              ) : (
                <UserAvatar url={item.other_user.avatar_url} name={item.other_user.first_name} size={52} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.rowTop}>
                <Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={1}>
                  {item.other_user.first_name}
                </Text>
                <Text style={[styles.time, { color: colors.muted }]}>
                  {item.last_message_at ? `${formatDateShort(item.last_message_at)} · ${formatTime(item.last_message_at)}` : ""}
                </Text>
              </View>
              {item.meal_title ? (
                <Text style={[styles.meal, { color: colors.onBrandTertiary }]} numberOfLines={1}>
                  {item.meal_title}
                </Text>
              ) : null}
              <View style={styles.rowBottom}>
                <Text style={[styles.preview, { color: colors.muted }]} numberOfLines={1}>
                  {item.last_message || "Nouvelle conversation"}
                </Text>
                {item.unread > 0 ? (
                  <View style={[styles.unread, { backgroundColor: colors.brandSecondary }]}>
                    <Text style={styles.unreadText}>{item.unread}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.divider }]} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontFamily: fonts.bold, fontSize: 26 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  avatarWrap: { width: 52, height: 52, borderRadius: 14, overflow: "hidden" },
  thumb: { width: 52, height: 52, borderRadius: 14 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontFamily: fonts.semibold, fontSize: 16, flex: 1 },
  time: { fontFamily: fonts.regular, fontSize: 12 },
  meal: { fontFamily: fonts.medium, fontSize: 13, marginTop: 2 },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 3 },
  preview: { fontFamily: fonts.regular, fontSize: 14, flex: 1 },
  unread: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, marginLeft: 8 },
  unreadText: { fontFamily: fonts.semibold, fontSize: 11, color: "#FFFFFF" },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 86 },
});
