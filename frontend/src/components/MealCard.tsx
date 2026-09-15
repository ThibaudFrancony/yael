import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Icon } from "@/src/components/Icon";
import { UserAvatar } from "@/src/components/UserAvatar";
import { fonts, useTheme } from "@/src/theme";
import { resolveImage } from "@/src/api/client";
import { formatEuroCents, formatDateShort, formatTime } from "@/src/lib/format";
import type { Meal } from "@/src/types";

export function MealCard({ meal, onPress }: { meal: Meal; onPress: () => void }) {
  const { colors } = useTheme();
  const img = resolveImage(meal.image);
  const remaining = meal.remaining_guests;

  return (
    <Pressable
      testID={`meal-card-${meal.id}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.95 : 1 }]}
    >
      <View style={styles.imageWrap}>
        <Image
          source={{ uri: img }}
          style={styles.image}
          contentFit="cover"
          transition={200}
          accessibilityLabel={meal.title}
        />
        <LinearGradient
          colors={["transparent", "rgba(29,0,59,0.05)", "rgba(29,0,59,0.82)"]}
          style={styles.scrim}
        />
        {/* price pill */}
        <View style={[styles.pricePill, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.priceText, { color: colors.onSurface }]}>
            {formatEuroCents(meal.price_cents)}
          </Text>
          <Text style={[styles.priceUnit, { color: colors.muted }]}> / pers.</Text>
        </View>
        {/* remaining pill */}
        <View style={[styles.seatsPill, { backgroundColor: "rgba(255,255,255,0.92)" }]}>
          <Icon name="users" size={12} color={colors.onBrandTertiary} />
          <Text style={[styles.seatsText, { color: colors.onSurface }]}>
            {remaining > 0 ? `${remaining} place${remaining > 1 ? "s" : ""}` : "Complet"}
          </Text>
        </View>
        {/* overlaid bottom info */}
        <View style={styles.overlay}>
          <Text style={styles.title} numberOfLines={1}>
            {meal.title}
          </Text>
          <View style={styles.metaRow}>
            <Icon name="map-pin" size={13} color="rgba(255,255,255,0.9)" />
            <Text style={styles.metaText}>
              {meal.city} · {formatDateShort(meal.starts_at)} · {formatTime(meal.starts_at)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.hostRow}>
          <UserAvatar url={meal.host.avatar_url} name={meal.host.first_name} size={34} />
          <View>
            <Text style={[styles.hostName, { color: colors.onSurface }]}>{meal.host.first_name}</Text>
            <Text style={[styles.hostSub, { color: colors.muted }]}>Hôte</Text>
          </View>
        </View>
        <View style={styles.ratingRow}>
          <Icon name="star" size={14} color={colors.brandSecondary} />
          <Text style={[styles.rating, { color: colors.onSurface }]}>
            {meal.host.rating_avg.toFixed(1)}
          </Text>
          <Text style={[styles.ratingCount, { color: colors.muted }]}>({meal.host.rating_count})</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#101828",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  imageWrap: { width: "100%", height: 240, position: "relative" },
  image: { width: "100%", height: "100%" },
  scrim: { ...StyleSheet.absoluteFillObject },
  pricePill: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  priceText: { fontFamily: fonts.bold, fontSize: 15 },
  priceUnit: { fontFamily: fonts.regular, fontSize: 12 },
  seatsPill: {
    position: "absolute",
    top: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  seatsText: { fontFamily: fonts.semibold, fontSize: 12 },
  overlay: { position: "absolute", left: 16, right: 16, bottom: 14 },
  title: { fontFamily: fonts.bold, fontSize: 20, color: "#FFFFFF" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  metaText: { fontFamily: fonts.medium, fontSize: 13, color: "rgba(255,255,255,0.92)" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hostRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hostName: { fontFamily: fonts.semibold, fontSize: 14 },
  hostSub: { fontFamily: fonts.regular, fontSize: 12 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  rating: { fontFamily: fonts.semibold, fontSize: 14 },
  ratingCount: { fontFamily: fonts.regular, fontSize: 13 },
});
