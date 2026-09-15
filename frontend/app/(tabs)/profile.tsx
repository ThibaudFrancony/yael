import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Icon } from "@/src/components/Icon";
import { UserAvatar } from "@/src/components/UserAvatar";
import { RatingDisplay } from "@/src/components/RatingDisplay";
import { VerificationBadge } from "@/src/components/VerificationBadge";
import { EmptyState } from "@/src/components/EmptyState";
import { fonts, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { api, resolveImage } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { formatEuroCents, formatDateShort } from "@/src/lib/format";
import type { Booking, Meal } from "@/src/types";

function VerifRow({ label, value, verified }: { label: string; value?: string; verified?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.verifRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.rowValue, { color: colors.onSurface }]} numberOfLines={1}>
          {value || "—"}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: verified ? colors.brandTertiary : colors.surfaceTertiary }]}>
        <Icon name={verified ? "check-circle" : "clock"} size={13} color={verified ? colors.onBrandTertiary : colors.muted} />
        <Text style={[styles.badgeText, { color: verified ? colors.onBrandTertiary : colors.muted }]}>
          {verified ? "Vérifié" : "Non vérifié"}
        </Text>
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.onSurface }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

function SettingRow({ icon, label, onPress, danger, testID }: any) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.settingRow}>
      <Icon name={icon} size={18} color={danger ? colors.error : colors.onSurfaceTertiary} />
      <Text style={[styles.settingLabel, { color: danger ? colors.error : colors.onSurface }]}>{label}</Text>
      {!danger ? <Icon name="chevron-right" size={18} color={colors.muted} /> : null}
    </Pressable>
  );
}

export default function Profile() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const toast = useToast();

  const { data: mine } = useQuery({
    queryKey: ["my-meals"],
    queryFn: () => api.get<{ meals: Meal[] }>("/meals/mine"),
  });
  const myMeals = mine?.meals ?? [];

  const { data: bookingsData } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: () => api.get<{ bookings: Booking[] }>("/bookings/mine"),
    refetchInterval: 8000,
  });
  const allBookings = bookingsData?.bookings ?? [];
  const upcoming = allBookings.filter((b) =>
    ["REQUESTED", "ACCEPTED_PENDING_PAYMENT", "CONFIRMED"].includes(b.state)
  );
  const recent = allBookings.filter((b) => b.state === "COMPLETED");

  const { data: connect, refetch: refetchConnect } = useQuery({
    queryKey: ["connect-status"],
    queryFn: () => api.get<{ connected: boolean; ready?: boolean; details_submitted?: boolean; payouts_enabled?: boolean }>("/connect/status"),
  });
  const [connectLoading, setConnectLoading] = useState(false);

  const startPayoutSetup = async () => {
    setConnectLoading(true);
    try {
      const res = await api.post<{ onboarding_url: string }>("/connect/account", {});
      if (Platform.OS === "web") {
        window.location.assign(res.onboarding_url);
      } else {
        await WebBrowser.openBrowserAsync(res.onboarding_url);
        refetchConnect();
      }
    } catch (e: any) {
      toast.show(e?.message || "Configuration Stripe indisponible.", "error");
    } finally {
      setConnectLoading(false);
    }
  };

  if (!user) return null;

  const idStatus = user.identity_verification_status;
  const idLabel =
    idStatus === "verified" ? "Vérifiée" : idStatus === "pending" ? "En cours" : idStatus === "rejected" ? "Refusée" : "Non commencée";

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <UserAvatar url={user.avatar_url} name={user.first_name} size={84} />
          <Text style={[styles.name, { color: colors.onSurface }]}>
            {user.first_name} {user.last_name}
          </Text>
          <View style={styles.cityRow}>
            <Icon name="map-pin" size={14} color={colors.muted} />
            <Text style={[styles.city, { color: colors.muted }]}>{user.city || "Ville non renseignée"}</Text>
            <VerificationBadge status={idStatus} compact />
          </View>
          <View style={styles.headerMeta}>
            <RatingDisplay rating={user.rating_avg} count={user.rating_count} showCount />
            <Text style={[styles.dot, { color: colors.muted }]}>·</Text>
            <Text style={[styles.member, { color: colors.muted }]}>
              Membre depuis {user.created_at ? user.created_at.slice(0, 4) : "—"}
            </Text>
          </View>
          <Pressable
            testID="edit-profile-button"
            onPress={() => router.push("/edit-profile")}
            style={[styles.editBtn, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
          >
            <Icon name="edit-2" size={15} color={colors.onSurface} />
            <Text style={[styles.editText, { color: colors.onSurface }]}>Modifier le profil</Text>
          </Pressable>
        </View>

        {/* Hosting stats */}
        <Section title="Statistiques d'hébergement">
          <View style={[styles.statsCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Stat value={user.meals_hosted_count} label="Repas organisés" />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <Stat value={user.guests_welcomed_count} label="Invités accueillis" />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <Stat value={user.rating_avg.toFixed(1)} label="Note moyenne" />
          </View>
        </Section>

        {/* Host payouts (Stripe Connect) */}
        <Section title="Versements (hôte)">
          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={[styles.payIcon, { backgroundColor: connect?.ready ? colors.success : colors.brandTertiary }]}>
                <Icon name={connect?.ready ? "check" : "credit-card"} size={18} color={connect?.ready ? "#FFFFFF" : colors.onBrandTertiary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={[styles.payoutPill, { backgroundColor: connect?.ready ? "#ECFDF3" : colors.brandTertiary }]}>
                  <View style={[styles.payoutDot, { backgroundColor: connect?.ready ? colors.success : colors.onBrandTertiary }]} />
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: connect?.ready ? colors.success : colors.onBrandTertiary }}>
                    {connect?.ready ? "Versements configurés" : "Versements à configurer"}
                  </Text>
                </View>
                <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 6 }}>
                  {connect?.ready
                    ? "Tes gains sont versés sur ton compte bancaire par Stripe."
                    : connect?.connected
                    ? "Reprends l'onboarding Stripe pour renseigner identité et coordonnées bancaires."
                    : "Connecte ton compte bancaire via Stripe pour être payé (Buddiz prélève 10%)."}
                </Text>
              </View>
            </View>
            {!connect?.ready ? (
              <Pressable testID="setup-payouts-button" onPress={startPayoutSetup} disabled={connectLoading} style={[styles.payBtn, { backgroundColor: colors.brandPrimary, opacity: connectLoading ? 0.6 : 1 }]}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.onBrandPrimary }}>
                  {connectLoading ? "..." : connect?.connected ? "Terminer la configuration" : "Configurer mes versements"}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable testID="view-earnings" onPress={() => router.push("/earnings")} style={[styles.earningsRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Icon name="bar-chart-2" size={18} color={colors.onSurface} />
            <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.onSurface, flex: 1 }}>Historique des versements</Text>
            <Icon name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        </Section>

        {/* Personal info */}
        <Section title="Informations personnelles">
          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <VerifRow label="Email" value={user.email} verified={user.email_verified} />
            <View style={[styles.hr, { backgroundColor: colors.divider }]} />
            <VerifRow label="Téléphone" value={user.phone} verified={user.phone_verified} />
            <View style={[styles.hr, { backgroundColor: colors.divider }]} />
            <VerifRow label="Vérification d'identité" value={idLabel} verified={idStatus === "verified"} />
          </View>
        </Section>

        {/* Upcoming bookings */}
        <Section title="Réservations à venir">
          {upcoming.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, paddingVertical: 8 }]}>
              <EmptyState icon="calendar" title="Aucune réservation à venir." testID="bookings-empty" />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {upcoming.map((b) => (
                <BookingRow key={b.id} b={b} onPress={() => router.push(`/conversation/${b.conversation_id}`)}>
                  {b.state === "ACCEPTED_PENDING_PAYMENT" ? (
                    <Pressable testID={`pay-${b.id}`} onPress={() => router.push(`/payment/${b.id}`)} style={[styles.rowBtn, { backgroundColor: colors.brandSecondary }]}>
                      <Text style={styles.rowBtnText}>Payer</Text>
                    </Pressable>
                  ) : (
                    <Pressable testID={`cancel-${b.id}`} onPress={() => router.push(`/cancel/${b.id}`)} style={[styles.rowBtn, { backgroundColor: colors.surfaceTertiary }]}>
                      <Text style={[styles.rowBtnText, { color: colors.onSurface }]}>Annuler</Text>
                    </Pressable>
                  )}
                </BookingRow>
              ))}
            </View>
          )}
        </Section>

        {/* Recent meals */}
        <Section title="Repas récents">
          {recent.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, paddingVertical: 8 }]}>
              <EmptyState icon="clock" title="Aucun repas récent." testID="recent-empty" />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {recent.map((b) => (
                <BookingRow key={b.id} b={b}>
                  {b.reviewed ? (
                    <View style={[styles.rowBtn, { backgroundColor: colors.brandTertiary }]}>
                      <Text style={[styles.rowBtnText, { color: colors.onBrandTertiary }]}>Évalué</Text>
                    </View>
                  ) : (
                    <Pressable testID={`review-${b.id}`} onPress={() => router.push(`/review/${b.id}`)} style={[styles.rowBtn, { backgroundColor: colors.brandPrimary }]}>
                      <Text style={styles.rowBtnText}>Évaluer</Text>
                    </Pressable>
                  )}
                </BookingRow>
              ))}
            </View>
          )}
        </Section>

        {/* My listings */}
        <Section title="Mes annonces">
          {myMeals.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, paddingVertical: 8 }]}>
              <EmptyState
                icon="grid"
                title="Tu n'as pas encore publié de repas."
                subtitle="Publie ton premier repas depuis l'onglet Ajouter."
                testID="listings-empty"
              />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {myMeals.map((m) => (
                <Pressable
                  key={m.id}
                  testID={`my-meal-${m.id}`}
                  onPress={() => router.push(`/meal/${m.id}`)}
                  style={[styles.listingRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listingTitle, { color: colors.onSurface }]} numberOfLines={1}>
                      {m.title}
                    </Text>
                    <Text style={[styles.listingSub, { color: colors.muted }]}>
                      {formatDateShort(m.starts_at)} · {formatEuroCents(m.price_cents)} · {m.remaining_guests} place(s)
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          )}
        </Section>

        {/* Settings */}
        <Section title="Paramètres">
          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, paddingVertical: 4 }]}>
            <SettingRow icon="bell" label="Notifications" onPress={() => router.push("/notifications")} testID="settings-notifications" />
            <SettingRow icon="lock" label="Confidentialité" onPress={() => toast.show("Bientôt disponible.", "info")} />
            <SettingRow icon="star" label="Donner ton avis" onPress={() => router.push("/feedback")} testID="settings-feedback" />
            <SettingRow icon="message-circle" label="Assistant Buddiz" onPress={() => router.push("/assistant")} testID="settings-assistant" />
            <SettingRow icon="help-circle" label="Aide et support" onPress={() => router.push("/assistant")} testID="settings-help" />
            <SettingRow icon="file-text" label="Conditions d'utilisation" onPress={() => toast.show("Bientôt disponible.", "info")} />
            <SettingRow icon="log-out" label="Déconnexion" danger onPress={logout} testID="logout-button" />
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
      <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>{title}</Text>
      {children}
    </View>
  );
}

const STATE_LABEL: Record<string, string> = {
  REQUESTED: "En attente",
  ACCEPTED_PENDING_PAYMENT: "À payer",
  CONFIRMED: "Confirmée",
  COMPLETED: "Terminée",
};

function BookingRow({ b, onPress, children }: { b: Booking; onPress?: () => void; children?: React.ReactNode }) {
  const { colors } = useTheme();
  const meal = b.meal;
  return (
    <Pressable
      testID={`booking-row-${b.id}`}
      onPress={onPress}
      style={[styles.bookingRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
    >
      <Image source={{ uri: resolveImage(meal?.image) }} style={styles.bookingImg} contentFit="cover" transition={150} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.listingTitle, { color: colors.onSurface }]} numberOfLines={1}>{meal?.title ?? "Repas"}</Text>
        <Text style={[styles.listingSub, { color: colors.muted }]} numberOfLines={1}>
          {meal ? formatDateShort(meal.starts_at) : ""} · {b.guest_count} pers. · {STATE_LABEL[b.state] ?? b.state}
        </Text>
      </View>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { alignItems: "center", paddingHorizontal: 20, paddingBottom: 8 },
  name: { fontFamily: fonts.bold, fontSize: 22, marginTop: 12 },
  cityRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  city: { fontFamily: fonts.medium, fontSize: 14 },
  headerMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  dot: { fontFamily: fonts.regular, fontSize: 14 },
  member: { fontFamily: fonts.regular, fontSize: 13 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
  },
  editText: { fontFamily: fonts.semibold, fontSize: 14 },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 17, marginBottom: 12 },
  statsCard: { flexDirection: "row", borderRadius: 16, borderWidth: 1, paddingVertical: 18 },
  stat: { flex: 1, alignItems: "center" },
  bookingRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 16, borderWidth: 1 },
  bookingImg: { width: 52, height: 52, borderRadius: 12, backgroundColor: "#EEE" },
  payIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  payoutPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  payoutDot: { width: 8, height: 8, borderRadius: 4 },
  payBtn: { marginTop: 14, paddingVertical: 12, borderRadius: 999, alignItems: "center" },
  earningsRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, borderWidth: 1, marginTop: 10 },
  rowBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  rowBtnText: { fontFamily: fonts.semibold, fontSize: 13, color: "#FFFFFF" },
  statValue: { fontFamily: fonts.bold, fontSize: 22 },
  statLabel: { fontFamily: fonts.regular, fontSize: 12, marginTop: 4, textAlign: "center" },
  statDivider: { width: StyleSheet.hairlineWidth },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  verifRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowLabel: { fontFamily: fonts.regular, fontSize: 12 },
  rowValue: { fontFamily: fonts.semibold, fontSize: 15, marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontFamily: fonts.medium, fontSize: 12 },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  listingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  listingTitle: { fontFamily: fonts.semibold, fontSize: 15 },
  listingSub: { fontFamily: fonts.regular, fontSize: 13, marginTop: 3 },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  settingLabel: { fontFamily: fonts.medium, fontSize: 15, flex: 1 },
});
