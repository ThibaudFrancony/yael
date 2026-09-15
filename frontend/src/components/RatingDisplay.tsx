import React from "react";
import { View, Text } from "react-native";
import { Icon } from "@/src/components/Icon";
import { fonts, useTheme } from "@/src/theme";

export function RatingDisplay({
  rating,
  count,
  size = 14,
  showCount = false,
}: {
  rating: number;
  count?: number;
  size?: number;
  showCount?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <Icon name="star" size={size} color={colors.brandSecondary} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: size, color: colors.onSurface }}>
        {(rating || 0).toFixed(1)}
      </Text>
      {showCount && count !== undefined ? (
        <Text style={{ fontFamily: fonts.regular, fontSize: size, color: colors.muted }}>
          {" "}
          ({count} avis)
        </Text>
      ) : null}
    </View>
  );
}
