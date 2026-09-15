import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import { useTheme } from "@/src/theme";

function Shimmer({ style }: { style?: any }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ backgroundColor: colors.surfaceTertiary, opacity }, style]} />;
}

export function MealCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]} testID="meal-skeleton">
      <Shimmer style={{ width: "100%", height: 240 }} />
      <View style={styles.footer}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Shimmer style={{ width: 34, height: 34, borderRadius: 17 }} />
          <Shimmer style={{ width: 90, height: 14, borderRadius: 7 }} />
        </View>
        <Shimmer style={{ width: 50, height: 14, borderRadius: 7 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, overflow: "hidden" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
});
