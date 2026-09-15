import React from "react";
import { View, Text } from "react-native";
import { Icon } from "@/src/components/Icon";
import { fonts, useTheme } from "@/src/theme";

// Only shows a real "verified" state. Never fakes verification.
export function VerificationBadge({
  status,
  compact = false,
}: {
  status?: string;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  if (status !== "verified") return null;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: colors.brandTertiary,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
      }}
      testID="verification-badge"
    >
      <Icon name="shield" size={12} color={colors.onBrandTertiary} />
      {!compact ? (
        <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.onBrandTertiary }}>
          Vérifié
        </Text>
      ) : null}
    </View>
  );
}
