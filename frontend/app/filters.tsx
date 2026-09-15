import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from "react-native";
import Slider from "@react-native-community/slider";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { FilterChip } from "@/src/components/Chips";
import { AppButton } from "@/src/components/AppButton";
import { fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { useFilters } from "@/src/state/filters";
import type { AppConfig } from "@/src/types";

export default function FiltersScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { filters, setFilters, reset } = useFilters();

  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<AppConfig>("/config"),
  });

  const [categories, setCategories] = useState<string[]>(filters.categories);
  const [interests, setInterests] = useState<string[]>(filters.interests);
  const [availableNow, setAvailableNow] = useState(filters.availableNow);
  const [smallGroups, setSmallGroups] = useState(filters.smallGroups);
  const [distance, setDistance] = useState(filters.maxDistance);

  const toggle = (list: string[], setList: (v: string[]) => void, val: string) => {
    setList(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
  };

  const apply = () => {
    setFilters({ categories, interests, availableNow, smallGroups, maxDistance: distance });
    router.back();
  };

  const clearAll = () => {
    setCategories([]);
    setInterests([]);
    setAvailableNow(false);
    setSmallGroups(false);
    setDistance(30);
    reset();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable testID="close-filters-button" onPress={() => router.back()} hitSlop={10}>
          <Icon name="x" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Filtres</Text>
        <Pressable testID="reset-filters-button" onPress={clearAll} hitSlop={10}>
          <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.onBrandTertiary }}>Réinitialiser</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {/* Distance */}
        <Text style={[styles.section, { color: colors.onSurface }]}>Distance</Text>
        <Text style={[styles.value, { color: colors.onBrandTertiary }]}>{Math.round(distance)} km</Text>
        <Slider
          testID="distance-slider"
          minimumValue={1}
          maximumValue={30}
          step={1}
          value={distance}
          onValueChange={setDistance}
          minimumTrackTintColor={colors.brandSecondary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.brandSecondary}
        />
        <View style={styles.rangeRow}>
          <Text style={[styles.rangeLabel, { color: colors.muted }]}>1 km</Text>
          <Text style={[styles.rangeLabel, { color: colors.muted }]}>30 km</Text>
        </View>

        {/* Categories */}
        <Text style={[styles.section, { color: colors.onSurface, marginTop: 24 }]}>Catégories & préférences</Text>
        <View style={styles.chipWrap}>
          {(config?.categories ?? []).map((c) => (
            <FilterChip
              key={c}
              testID={`category-chip-${c}`}
              label={c}
              selected={categories.includes(c)}
              onPress={() => toggle(categories, setCategories, c)}
            />
          ))}
        </View>

        {/* Interests */}
        <Text style={[styles.section, { color: colors.onSurface, marginTop: 24 }]}>{"Centres d'intérêt"}</Text>
        <View style={styles.chipWrap}>
          {(config?.interests ?? []).map((c) => (
            <FilterChip
              key={c}
              testID={`interest-chip-${c}`}
              label={c}
              selected={interests.includes(c)}
              onPress={() => toggle(interests, setInterests, c)}
            />
          ))}
        </View>

        {/* Quick filters */}
        <Text style={[styles.section, { color: colors.onSurface, marginTop: 24 }]}>Filtres rapides</Text>
        <View style={[styles.toggleRow, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.toggleLabel, { color: colors.onSurface }]}>Disponible maintenant</Text>
          <Switch
            testID="toggle-available-now"
            value={availableNow}
            onValueChange={setAvailableNow}
            trackColor={{ true: colors.brandSecondary, false: colors.border }}
            thumbColor="#FFFFFF"
          />
        </View>
        <View style={[styles.toggleRow, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, marginTop: 10 }]}>
          <Text style={[styles.toggleLabel, { color: colors.onSurface }]}>Petits groupes (2-4 personnes)</Text>
          <Switch
            testID="toggle-small-groups"
            value={smallGroups}
            onValueChange={setSmallGroups}
            trackColor={{ true: colors.brandSecondary, false: colors.border }}
            thumbColor="#FFFFFF"
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <AppButton testID="apply-filters-button" title="Appliquer les filtres" onPress={apply} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontFamily: fonts.semibold, fontSize: 18 },
  section: { fontFamily: fonts.semibold, fontSize: 16, marginBottom: 12 },
  value: { fontFamily: fonts.bold, fontSize: 20, marginBottom: 4 },
  rangeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  rangeLabel: { fontFamily: fonts.regular, fontSize: 12 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  toggleLabel: { fontFamily: fonts.medium, fontSize: 15 },
  footer: { paddingHorizontal: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
});
