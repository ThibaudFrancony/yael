import React, { useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, ActivityIndicator } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING: Msg = {
  role: "assistant",
  content: "Bonjour 👋 Je suis l'assistant Buddiz. Pose-moi une question sur les repas, les réservations, le paiement ou l'hébergement !",
};
const QUICK = [
  "Comment réserver un repas ?",
  "Comment devenir hôte ?",
  "Comment être payé ?",
  "Politique d'annulation ?",
];

export default function Assistant() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlatList<Msg>>(null);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setInput("");
    const history = messages.filter((m) => m !== GREETING);
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setLoading(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const res = await api.post<{ reply: string }>("/ai/assistant", { message: q, history });
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply || "…" }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Désolé, je suis momentanément indisponible. Réessaie dans un instant." }]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable testID="assistant-back" onPress={() => router.back()} hitSlop={10}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={[styles.aiDot, { backgroundColor: colors.brandSecondary }]}>
            <Icon name="zap" size={14} color={colors.onBrandSecondary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Assistant Buddiz</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="translate-with-padding" keyboardVerticalOffset={0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 16, paddingBottom: 12, gap: 10 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const mine = item.role === "user";
            return (
              <View style={[styles.bubble, mine
                ? { alignSelf: "flex-end", backgroundColor: colors.brandSecondary, borderBottomRightRadius: 4 }
                : { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 4 }]}>
                <Text style={{ fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: mine ? colors.onBrandSecondary : colors.onSurface }}>
                  {item.content}
                </Text>
              </View>
            );
          }}
          ListFooterComponent={
            <View>
              {loading ? (
                <View style={[styles.bubble, { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, flexDirection: "row", gap: 8, alignItems: "center" }]}>
                  <ActivityIndicator size="small" color={colors.muted} />
                  <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.muted }}>écrit...</Text>
                </View>
              ) : null}
              {messages.length <= 1 ? (
                <View style={{ gap: 8, marginTop: 12 }}>
                  {QUICK.map((q) => (
                    <Pressable key={q} testID={`quick-${q}`} onPress={() => send(q)} style={[styles.quick, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
                      <Icon name="message-circle" size={15} color={colors.brandSecondary} />
                      <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.onSurface }}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          }
        />

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 10, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <TextInput
            testID="assistant-input"
            value={input}
            onChangeText={setInput}
            placeholder="Pose ta question..."
            placeholderTextColor={colors.muted}
            style={[styles.input, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface }]}
            multiline
            onSubmitEditing={() => send(input)}
          />
          <Pressable testID="assistant-send" onPress={() => send(input)} disabled={!input.trim() || loading} style={[styles.sendBtn, { backgroundColor: input.trim() && !loading ? colors.brandSecondary : colors.borderStrong }]}>
            <Icon name="arrow-up" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontFamily: fonts.semibold, fontSize: 17 },
  aiDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "82%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  quick: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: fonts.regular, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
