import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { TextField } from "@/src/components/TextField";
import { AppButton } from "@/src/components/AppButton";
import { fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import type { Meal } from "@/src/types";

const REASONS = ["Changement de planning", "Urgence personnelle", "Problème de santé", "Problème d'approvisionnement", "Autre raison"];

export default function EditMeal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["meal", id], queryFn: () => api.get<{ meal: Meal }>(`/meals/${id}`), enabled: !!id });
  const meal = data?.meal;

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [maxGuests, setMaxGuests] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [reason, setReason] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    if (meal) {
      setTitle(meal.title);
      setPrice(String(meal.price_cents / 100));
      setMaxGuests(String(meal.max_guests));
      setDescription(meal.description);
    }
  }, [meal?.id]);

  const save = async () => {
    const priceCents = Math.round(parseFloat(price.replace(",", ".")) * 100);
    setSaving(true);
    try {
      await api.put(`/meals/${id}`, {
        title: title.trim(),
        price_cents: isNaN(priceCents) ? undefined : priceCents,
        max_guests: parseInt(maxGuests) || undefined,
        description: description.trim(),
      });
      qc.invalidateQueries({ queryKey: ["meal", id] });
      qc.invalidateQueries({ queryKey: ["my-meals"] });
      qc.invalidateQueries({ queryKey: ["meals"] });
      toast.show("Annonce mise à jour.", "success");
      router.back();
    } catch (e: any) {
      toast.show(e?.message || "Enregistrement impossible.", "error");
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    if (!reason) return toast.show("Choisis une raison.", "error");
    setWithdrawing(true);
    try {
      await api.post(`/meals/${id}/withdraw`, { reason });
      qc.invalidateQueries({ queryKey: ["my-meals"] });
      qc.invalidateQueries({ queryKey: ["meals"] });
      toast.show("Annonce retirée. Les invités ont été prévenus.", "success");
      router.back();
    } catch (e: any) {
      toast.show(e?.message || "Retrait impossible.", "error");
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable testID="editmeal-back" onPress={() => router.back()} hitSlop={10}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Modifier l&apos;annonce</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <Pressable testID="view-reservations" onPress={() => router.push(`/reservations/${id}`)} style={[styles.resLink, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Icon name="users" size={18} color={colors.onBrandTertiary} />
          <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.onSurface, flex: 1 }}>Voir les réservations</Text>
          <Icon name="chevron-right" size={18} color={colors.muted} />
        </Pressable>

        <View style={{ gap: 16, marginTop: 16 }}>
          <TextField testID="edit-meal-title" label="Nom du repas" value={title} onChangeText={setTitle} />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <TextField testID="edit-meal-price" label="Prix / personne (€)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField testID="edit-meal-guests" label="Invités max" value={maxGuests} onChangeText={setMaxGuests} keyboardType="number-pad" />
            </View>
          </View>
          <TextField testID="edit-meal-description" label="Description" value={description} onChangeText={setDescription} multiline style={{ height: 110, textAlignVertical: "top", paddingTop: 12 }} />
          <AppButton testID="save-meal-button" title="Enregistrer" onPress={save} loading={saving} />
        </View>

        {/* Withdraw */}
        <View style={{ marginTop: 32 }}>
          {!showWithdraw ? (
            <Pressable testID="show-withdraw" onPress={() => setShowWithdraw(true)}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.error, textAlign: "center" }}>Retirer l&apos;annonce</Text>
            </Pressable>
          ) : (
            <View>
              <Text style={[styles.label, { color: colors.onSurface }]}>Pourquoi retires-tu cette annonce ?</Text>
              <View style={{ gap: 10 }}>
                {REASONS.map((r) => (
                  <Pressable key={r} testID={`wreason-${r}`} onPress={() => setReason(r)} style={[styles.reason, { backgroundColor: colors.surfaceSecondary, borderColor: reason === r ? colors.brandSecondary : colors.border }]}>
                    <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.onSurface }}>{r}</Text>
                    <Icon name={reason === r ? "check-circle" : "circle"} size={20} color={reason === r ? colors.brandSecondary : colors.border} />
                  </Pressable>
                ))}
              </View>
              <View style={[styles.warn, { backgroundColor: colors.brandTertiary }]}>
                <Icon name="alert-triangle" size={16} color={colors.onBrandTertiary} />
                <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.onBrandTertiary, flex: 1, lineHeight: 19 }}>
                  Les réservations en cours seront annulées et remboursées. Cette action est irréversible.
                </Text>
              </View>
              <AppButton testID="confirm-withdraw-button" title="Retirer l'annonce définitivement" onPress={withdraw} loading={withdrawing} style={{ backgroundColor: colors.error, marginTop: 8 }} />
            </View>
          )}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontFamily: fonts.semibold, fontSize: 18 },
  resLink: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, borderWidth: 1 },
  label: { fontFamily: fonts.semibold, fontSize: 16, marginBottom: 12 },
  reason: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderRadius: 14, borderWidth: 1 },
  warn: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, marginTop: 16 },
});
