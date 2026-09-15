import React, { useState, useEffect } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { Icon } from "@/src/components/Icon";
import { SearchBar } from "@/src/components/SearchBar";
import { MealCard } from "@/src/components/MealCard";
import { MealCardSkeleton } from "@/src/components/Skeletons";
import { EmptyState, ErrorState } from "@/src/components/EmptyState";
import { fonts, useTheme } from "@/src/theme";
import { useFilters, buildMealQuery } from "@/src/state/filters";
import type { Meal } from "@/src/types";

export default function Discover() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { filters, activeCount } = useFilters();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const queryStr = buildMealQuery(filters, debounced);

  const { data: unread } = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => api.get<{ unread: number }>("/notifications/unread-count"),
    refetchInterval: 8000,
  });
  const unreadCount = unread?.unread ?? 0;

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["meals", queryStr],
    queryFn: () => api.get<{ meals: Meal[] }>(`/meals${queryStr}`),
  });

  const meals = data?.meals ?? [];

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.onSurface }]}>Découvrir</Text>
          <Pressable testID="open-notifications" onPress={() => router.push("/notifications")} hitSlop={8} style={styles.bell}>
            <Icon name="bell" size={24} color={colors.onSurface} />
            {unreadCount > 0 ? (
              <View style={[styles.bellBadge, { backgroundColor: colors.brandSecondary }]}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        <View style={{ marginTop: 12 }}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            onFilterPress={() => router.push("/filters")}
            activeFilterCount={activeCount}
          />
        </View>
      </View>

      {isLoading ? (
        <FlatList
          data={[1, 2, 3]}
          keyExtractor={(i) => String(i)}
          contentContainerStyle={styles.list}
          renderItem={() => (
            <View style={{ marginBottom: 18 }}>
              <MealCardSkeleton />
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={meals}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[styles.list, meals.length === 0 && { flexGrow: 1 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandSecondary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="coffee"
              title="Aucun repas ne correspond à tes critères."
              subtitle="Essaie d'élargir ta zone de recherche ou de retirer certains filtres."
              testID="discover-empty"
            />
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 18 }}>
              <MealCard meal={item} onPress={() => router.push(`/meal/${item.id}`)} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.bold, fontSize: 30 },
  bell: { padding: 2 },
  bellBadge: { position: "absolute", top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  bellBadgeText: { fontFamily: fonts.semibold, fontSize: 9, color: "#FFFFFF" },
  list: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 },
});
