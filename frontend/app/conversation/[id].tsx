import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, FlatList } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { UserAvatar } from "@/src/components/UserAvatar";
import { fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { useToast } from "@/src/components/Toast";
import { formatTime, formatEuroCents } from "@/src/lib/format";
import type { Conversation, Message } from "@/src/types";

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const listRef = useRef<FlatList>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api.get<{ conversation: Conversation; messages: Message[] }>(`/conversations/${id}`),
    enabled: !!id,
    refetchInterval: 4000,
  });

  const conv = data?.conversation;
  const messages = data?.messages ?? [];
  const meId = user?.id;

  useEffect(() => {
    if (messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  const send = async () => {
    if (!text.trim()) return;
    const body = text.trim();
    setText("");
    setSuggestions([]);
    try {
      await api.post(`/conversations/${id}/messages`, { body });
      refetch();
    } catch {
      toast.show("Envoi impossible.", "error");
    }
  };

  const fetchSuggestions = async () => {
    if (suggesting || messages.length === 0) return;
    setSuggesting(true);
    try {
      const res = await api.post<{ suggestions: string[] }>("/ai/reply-suggestions", { conversation_id: id });
      setSuggestions(res.suggestions || []);
      if (!res.suggestions?.length) toast.show("Aucune suggestion pour le moment.", "info");
    } catch (e: any) {
      toast.show(e?.message || "Suggestions indisponibles.", "error");
    } finally {
      setSuggesting(false);
    }
  };

  const requestBooking = async () => {
    if (!conv?.meal_id) return;
    setBusy(true);
    try {
      await api.post("/bookings", { meal_id: conv.meal_id, guest_count: 1 });
      refetch();
      toast.show("Demande envoyée à l'hôte.", "success");
    } catch (e: any) {
      toast.show(e?.message || "Impossible d'envoyer la demande.", "error");
    } finally {
      setBusy(false);
    }
  };

  const act = async (bookingId: string, action: "accept" | "decline") => {
    setBusy(true);
    try {
      await api.post(`/bookings/${bookingId}/${action}`);
      refetch();
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      toast.show(action === "accept" ? "Demande acceptée." : "Demande refusée.", "success");
    } catch (e: any) {
      toast.show(e?.message || "Action impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  // Does an active booking already exist in this conversation (for guest)?
  const activeBooking = messages
    .filter((m) => m.booking)
    .map((m) => m.booking!)
    .find((b) => ["REQUESTED", "ACCEPTED_PENDING_PAYMENT", "CONFIRMED", "COMPLETED"].includes(b.state));
  const iAmGuest = activeBooking ? activeBooking.guest_id === meId : true;

  const renderItem = ({ item }: { item: Message }) => {
    const mine = item.sender_id === meId;

    if (item.type === "booking_request" && item.booking) {
      const b = item.booking;
      const amHost = b.host_id === meId;
      return (
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} testID="booking-request-card">
          <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Demande de réservation</Text>
          <Text style={[styles.cardBody, { color: colors.muted }]}>
            {b.guest_count} personne(s) · {formatEuroCents(b.total_cents)}
          </Text>
          {amHost && b.state === "REQUESTED" ? (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable testID="accept-booking-button" disabled={busy} onPress={() => act(b.id, "accept")} style={[styles.smBtn, { backgroundColor: colors.brandPrimary }]}>
                <Text style={[styles.smBtnText, { color: colors.onBrandPrimary }]}>Accepter</Text>
              </Pressable>
              <Pressable testID="decline-booking-button" disabled={busy} onPress={() => act(b.id, "decline")} style={[styles.smBtn, { backgroundColor: colors.surfaceTertiary }]}>
                <Text style={[styles.smBtnText, { color: colors.onSurface }]}>Refuser</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.statePill, { backgroundColor: colors.brandTertiary }]}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.onBrandTertiary }}>
                {b.state === "REQUESTED" ? "En attente de l'hôte" : b.state === "ACCEPTED_PENDING_PAYMENT" ? "Acceptée" : b.state === "CONFIRMED" ? "Confirmée" : b.state === "DECLINED" ? "Refusée" : b.state}
              </Text>
            </View>
          )}
        </View>
      );
    }

    if (item.type === "booking_accepted" && item.booking) {
      const b = item.booking;
      const amGuest = b.guest_id === meId;
      return (
        <View style={[styles.card, { backgroundColor: colors.brandTertiary, borderColor: colors.brandTertiary }]} testID="booking-accepted-card">
          <Text style={[styles.cardTitle, { color: colors.onBrandTertiary }]}>Réservation acceptée !</Text>
          <Text style={[styles.cardBody, { color: colors.onSurfaceTertiary }]}>{item.body}</Text>
          {amGuest && b.state === "ACCEPTED_PENDING_PAYMENT" ? (
            <Pressable testID="proceed-payment-button" onPress={() => router.push(`/payment/${b.id}`)} style={[styles.smBtn, { backgroundColor: colors.brandPrimary, marginTop: 12 }]}>
              <Icon name="credit-card" size={16} color={colors.onBrandPrimary} />
              <Text style={[styles.smBtnText, { color: colors.onBrandPrimary, marginLeft: 6 }]}>Procéder au paiement</Text>
            </Pressable>
          ) : b.state === "CONFIRMED" ? (
            <View style={[styles.statePill, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.success }}>Réservation confirmée ✅</Text>
            </View>
          ) : null}
        </View>
      );
    }

    if (item.type === "system") {
      return (
        <View style={styles.systemWrap}>
          <Text style={[styles.systemText, { color: colors.muted, backgroundColor: colors.surfaceTertiary }]}>{item.body}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.bubbleRow, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
        <View style={[styles.bubble, mine ? { backgroundColor: colors.brandSecondary } : { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={{ fontFamily: fonts.regular, fontSize: 15, color: mine ? colors.onBrandSecondary : colors.onSurface }}>{item.body}</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 10, color: mine ? "rgba(255,255,255,0.8)" : colors.muted, marginTop: 4, textAlign: "right" }}>
            {formatTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable testID="conv-back" onPress={() => router.back()} hitSlop={10}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <UserAvatar url={conv?.other_user.avatar_url} name={conv?.other_user.first_name} size={36} />
          <View>
            <Text style={[styles.hName, { color: colors.onSurface }]}>{conv?.other_user.first_name || ""}</Text>
            {conv?.meal_title ? <Text style={[styles.hMeal, { color: colors.muted }]} numberOfLines={1}>{conv.meal_title}</Text> : null}
          </View>
        </View>
        {conv?.meal_id ? (
          <Pressable testID="conv-meal-link" onPress={() => router.push(`/meal/${conv.meal_id}`)} hitSlop={10}>
            <Icon name="external-link" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView behavior="translate-with-padding" keyboardVerticalOffset={0} style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        />

        {/* Guest can request a place if none active yet */}
        {conv?.meal_id && iAmGuest && !activeBooking ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <Pressable testID="request-booking-button" disabled={busy} onPress={requestBooking} style={[styles.requestBtn, { backgroundColor: colors.brandPrimary }]}>
              <Icon name="calendar" size={16} color={colors.onBrandPrimary} />
              <Text style={[styles.smBtnText, { color: colors.onBrandPrimary, marginLeft: 6 }]}>Demander une place</Text>
            </Pressable>
          </View>
        ) : null}

        {/* AI reply suggestions */}
        {suggestions.length > 0 ? (
          <View style={{ paddingHorizontal: 12, paddingBottom: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {suggestions.map((s, i) => (
              <Pressable
                key={i}
                testID={`suggestion-${i}`}
                onPress={() => { setText(s); setSuggestions([]); }}
                style={[styles.suggestion, { backgroundColor: colors.brandTertiary, borderColor: colors.onBrandTertiary }]}
              >
                <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.onBrandTertiary }}>{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <Pressable testID="ai-suggest-btn" onPress={fetchSuggestions} disabled={suggesting} style={[styles.aiBtn, { borderColor: colors.border, opacity: suggesting ? 0.5 : 1 }]}>
            <Icon name="zap" size={18} color={colors.brandSecondary} />
          </Pressable>
          <TextInput
            testID="message-input"
            value={text}
            onChangeText={setText}
            placeholder="Écris un message..."
            placeholderTextColor={colors.muted}
            style={[styles.input, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface }]}
            multiline
          />
          <Pressable testID="send-message-btn" onPress={send} style={[styles.sendBtn, { backgroundColor: colors.brandSecondary }]}>
            <Icon name="send" size={18} color={colors.onBrandSecondary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  hName: { fontFamily: fonts.semibold, fontSize: 16 },
  hMeal: { fontFamily: fonts.regular, fontSize: 12, maxWidth: 200 },
  bubbleRow: { flexDirection: "row", marginBottom: 10 },
  bubble: { maxWidth: "78%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  systemWrap: { alignItems: "center", marginVertical: 8 },
  systemText: { fontFamily: fonts.medium, fontSize: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, overflow: "hidden", textAlign: "center" },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginVertical: 8 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  cardBody: { fontFamily: fonts.regular, fontSize: 14, marginTop: 4, lineHeight: 20 },
  smBtn: { flex: 1, height: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  smBtnText: { fontFamily: fonts.semibold, fontSize: 14 },
  statePill: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, marginTop: 12 },
  requestBtn: { height: 48, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: fonts.regular, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  aiBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  suggestion: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
});
