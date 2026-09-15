import React from "react";
import { View, TextInput, Pressable, StyleSheet } from "react-native";
import { Icon } from "@/src/components/Icon";
import { fonts, useTheme } from "@/src/theme";

export function SearchBar({
  value,
  onChangeText,
  onFilterPress,
  activeFilterCount = 0,
  placeholder = "Rechercher des repas, cuisines, hôtes...",
}: {
  value: string;
  onChangeText: (t: string) => void;
  onFilterPress?: () => void;
  activeFilterCount?: number;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.field, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput
          testID="search-input"
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.onSurface }]}
          returnKeyType="search"
        />
        {value.length > 0 ? (
          <Pressable testID="search-clear" onPress={() => onChangeText("")} hitSlop={8}>
            <Icon name="x" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {onFilterPress ? (
        <Pressable
          testID="open-filters-button"
          onPress={onFilterPress}
          style={[styles.filterBtn, { backgroundColor: colors.brandPrimary }]}
        >
          <Icon name="sliders" size={20} color={colors.onBrandPrimary} />
          {activeFilterCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.brandSecondary }]} />
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 50,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 15, padding: 0 },
  filterBtn: {
    width: 50,
    height: 50,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
});
