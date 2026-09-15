import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { fonts, useTheme } from "@/src/theme";
import { resolveImage } from "@/src/api/client";

type Props = { url?: string | null; name?: string; size?: number; testID?: string };

export function UserAvatar({ url, name, size = 44, testID }: Props) {
  const { colors } = useTheme();
  const resolved = resolveImage(url);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <View
      testID={testID}
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brandTertiary },
      ]}
    >
      {resolved ? (
        <Image source={{ uri: resolved }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.4, color: colors.onBrandTertiary }]}>
          {initial}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initial: { fontFamily: fonts.semibold },
});
