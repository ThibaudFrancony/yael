import React from "react";
import { View, Text, Pressable } from "react-native";
import { fonts, useTheme } from "@/src/theme";

// Small pill tag used for dietary/cuisine/feature tags on meals.
export function MealTag({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "accent" }) {
  const { colors } = useTheme();
  const bg = tone === "accent" ? colors.brandTertiary : colors.surfaceTertiary;
  const fg = tone === "accent" ? colors.onBrandTertiary : colors.onSurfaceTertiary;
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }}>
      <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: fg }}>{label}</Text>
    </View>
  );
}

// Selectable filter chip (used in the Filters screen). 36pt tall, color/border
// change only on selection.
export function FilterChip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{
        height: 36,
        justifyContent: "center",
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: selected ? colors.brandSecondary : colors.surfaceTertiary,
        borderWidth: 1,
        borderColor: selected ? colors.brandSecondary : colors.border,
        flexShrink: 0,
      }}
    >
      <Text
        style={{
          fontFamily: fonts.medium,
          fontSize: 14,
          color: selected ? colors.onBrandSecondary : colors.onSurfaceTertiary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
