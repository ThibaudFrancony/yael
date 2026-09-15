import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { UserAvatar } from "@/src/components/UserAvatar";
import { RatingDisplay } from "@/src/components/RatingDisplay";
import { VerificationBadge } from "@/src/components/VerificationBadge";
import { MealTag } from "@/src/components/Chips";
import { AppButton } from "@/src/components/AppButton";
import { ErrorState } from "@/src/components/EmptyState";
import { fonts, useTheme } from "@/src/theme";
import { api, resolveImage } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { useToast } from "@/src/components/Toast";
import { formatEuroCents, formatDateLong, formatTime } from "@/src/lib/format";
import type { Meal } from "@/src/types";

function Row({ icon, label, value }: { icon: any; label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIcon, { backgroundColor: colors.brandTertiary }]}>
        <Icon name={icon} size={16} color={colors.onBrandTertiary} />
      </View>
      <View>
        <Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.onSurface }]}>{value}</Text>
      </View>
    </View>
  );
}

export default function MealDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [contacting, setContacting] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["meal", id],
    queryFn: () => api.get<{ meal: Meal }>(`/meals/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.brandSecondary} size="large" />
      </View>
    );
  }
  if (isError || !data?.meal) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        <ErrorState onRetry={() => refetch()} />
      </View>
    );
  }

  const meal = data.meal;
  const remaining = meal.remaining_guests;
  const isHost = user?.id === meal.host_id;

  const contactHost = async () => {
    setContacting(true);
    try {
      const res = await api.post<{ conversation: { id: string } }>("/conversations", { meal_id: meal.id });
      router.push(`/conversation/${res.conversation.id}`);
    } catch (e: any) {
      toast.show(e?.message || "Impossible d'ouvrir la conversation.", "error");
    } finally {
      setContacting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Hero */}
        <View style={styles.heroWrap}>
          <Image source={{ uri: resolveImage(meal.image) }} style={styles.hero} contentFit="cover" transition={200} />
          <LinearGradient colors={["rgba(29,0,59,0.35)", "transparent"]} style={styles.heroTop} />
          <Pressable
            testID="meal-back-button"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
            style={[styles.backBtn, { top: insets.top + 8 }]}
          >
            <Icon name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
        </View>

        {/* Panel */}
        <View style={[styles.panel, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.onSurface }]}>{meal.title}</Text>
          <View style={styles.cityRow}>
            <Icon name="map-pin" size={15} color={colors.muted} />
            <Text style={[styles.city, { color: colors.muted }]}>{meal.city}</Text>
          </View>

          {/* Info grid */}
          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Row icon="calendar" label="Date" value={formatDateLong(meal.starts_at)} />
            <Row icon="clock" label="Heure" value={formatTime(meal.starts_at)} />
            <Row icon="tag" label="Prix par personne" value={`${formatEuroCents(meal.price_cents)} / personne`} />
            <Row
              icon="users"
              label="Places"
              value={`Maximum ${meal.max_guests} · ${remaining > 0 ? `${remaining} place${remaining > 1 ? "s" : ""} disponible${remaining > 1 ? "s" : ""}` : "Complet"}`}
            />
          </View>

          {/* Host */}
          <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Ton hôte</Text>
          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <View style={styles.hostRow}>
              <UserAvatar url={meal.host.avatar_url} name={meal.host.first_name} size={52} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={[styles.hostName, { color: colors.onSurface }]}>
                    Préparé par {meal.host.first_name}
                  </Text>
                  <VerificationBadge status={meal.host.identity_verification_status} compact />
                </View>
                <View style={{ marginTop: 4 }}>
                  <RatingDisplay rating={meal.host.rating_avg} count={meal.host.rating_count} showCount />
                </View>
              </View>
            </View>
          </View>

          {/* Address privacy */}
          <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Lieu</Text>
          {meal.address_visible && meal.exact_address ? (
            <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Row icon="map-pin" label="Adresse exacte" value={meal.exact_address} />
            </View>
          ) : (
            <View style={[styles.privacyBox, { backgroundColor: colors.brandTertiary }]} testID="address-hidden-box">
              <Icon name="lock" size={18} color={colors.onBrandTertiary} />
              <Text style={[styles.privacyText, { color: colors.onBrandTertiary }]}>
                Adresse communiquée après confirmation de la réservation.
              </Text>
            </View>
          )}

          {/* Description */}
          <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>À propos de ce repas</Text>
          <Text style={[styles.description, { color: colors.onSurfaceTertiary }]}>{meal.description}</Text>

          {/* Dietary + features */}
          {(meal.features.length > 0 || meal.dietary_tags.length > 0 || meal.cuisine_tags.length > 0) && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Informations & options</Text>
              <View style={styles.tagWrap}>
                {meal.cuisine_tags.map((t) => (
                  <MealTag key={`c-${t}`} label={t} tone="accent" />
                ))}
                {meal.dietary_tags.map((t) => (
                  <MealTag key={`d-${t}`} label={t} />
                ))}
                {meal.features.map((t) => (
                  <MealTag key={`f-${t}`} label={t} />
                ))}
              </View>
            </>
          )}

          {meal.special_notes ? (
            <Text style={[styles.notes, { color: colors.muted }]}>{meal.special_notes}</Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        {isHost ? (
          <AppButton testID="manage-meal-button" title="Gérer l'annonce" onPress={() => router.push(`/edit-meal/${meal.id}`)} />
        ) : (
          <AppButton
            testID="send-message-button"
            title="Envoyer un message"
            loading={contacting}
            onPress={contactHost}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroWrap: { width: "100%", height: 300 },
  hero: { width: "100%", height: "100%" },
  heroTop: { position: "absolute", top: 0, left: 0, right: 0, height: 110 },
  backBtn: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    marginTop: -28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  title: { fontFamily: fonts.bold, fontSize: 26 },
  cityRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  city: { fontFamily: fonts.medium, fontSize: 15 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginTop: 14, gap: 16 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  infoIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontFamily: fonts.regular, fontSize: 12 },
  infoValue: { fontFamily: fonts.semibold, fontSize: 15, marginTop: 1 },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 18, marginTop: 24 },
  hostRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  hostName: { fontFamily: fonts.semibold, fontSize: 15 },
  privacyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderRadius: 16,
    marginTop: 14,
  },
  privacyText: { fontFamily: fonts.medium, fontSize: 14, flex: 1, lineHeight: 20 },
  description: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, marginTop: 12 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  notes: { fontFamily: fonts.regular, fontSize: 14, fontStyle: "italic", marginTop: 16 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
