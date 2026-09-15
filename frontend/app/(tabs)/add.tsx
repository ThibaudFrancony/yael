import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { TextField } from "@/src/components/TextField";
import { AppButton } from "@/src/components/AppButton";
import { FilterChip } from "@/src/components/Chips";
import { fonts, useTheme } from "@/src/theme";
import { api, uploadImage, resolveImage } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import type { AppConfig, Meal } from "@/src/types";

const CUISINES = ["Italien", "Asiatique", "Africain", "Mexicain", "Français", "Dessert"];

export default function AddMeal() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: config } = useQuery({ queryKey: ["config"], queryFn: () => api.get<AppConfig>("/config") });

  const [image, setImage] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [maxGuests, setMaxGuests] = useState("4");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [cuisine, setCuisine] = useState<string[]>([]);
  const [dietary, setDietary] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast.show("Autorise l'accès aux photos.", "error");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [4, 3] });
    if (r.canceled || !r.assets?.[0]) return;
    setUploading(true);
    try {
      const up = await uploadImage(r.assets[0].uri);
      setImage(up.url);
    } catch {
      toast.show("Échec du téléversement.", "error");
    } finally {
      setUploading(false);
    }
  };

  const publish = async () => {
    const priceCents = Math.round(parseFloat(price.replace(",", ".")) * 100);
    if (!title.trim()) return toast.show("Ajoute un titre.", "error");
    if (!image) return toast.show("Une photo est requise pour publier.", "error");
    if (isNaN(priceCents) || priceCents < 0) return toast.show("Prix invalide.", "error");
    if (!maxGuests || parseInt(maxGuests) <= 0) return toast.show("Nombre d'invités invalide.", "error");
    if (!city.trim() || !address.trim()) return toast.show("Ville et adresse requises.", "error");
    if (!description.trim()) return toast.show("Ajoute une description.", "error");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast.show("Date au format AAAA-MM-JJ.", "error");
    if (!/^\d{2}:\d{2}$/.test(time)) return toast.show("Heure au format HH:MM (24h).", "error");

    setSaving(true);
    try {
      const res = await api.post<{ meal: Meal }>("/meals", {
        title: title.trim(),
        description: description.trim(),
        image,
        price_cents: priceCents,
        max_guests: parseInt(maxGuests),
        city: city.trim(),
        exact_address: address.trim(),
        starts_at: `${date}T${time}`,
        cuisine_tags: cuisine,
        dietary_tags: dietary,
        interest_tags: interests,
        special_notes: notes.trim() || undefined,
        status: "published",
      });
      qc.invalidateQueries({ queryKey: ["meals"] });
      qc.invalidateQueries({ queryKey: ["my-meals"] });
      toast.show("Repas publié ! 🎉", "success");
      router.push(`/meal/${res.meal.id}`);
      // reset
      setImage(null); setTitle(""); setDescription(""); setPrice(""); setCity("");
      setAddress(""); setDate(""); setTime(""); setCuisine([]); setDietary([]); setInterests([]); setNotes("");
    } catch (e: any) {
      toast.show(e?.message || "Publication impossible.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Publier un repas</Text>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <Pressable testID="pick-meal-photo" onPress={pickPhoto} style={[styles.photo, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
          {image ? (
            <Image source={{ uri: resolveImage(image) }} style={styles.photoImg} contentFit="cover" />
          ) : (
            <View style={{ alignItems: "center", gap: 8 }}>
              <Icon name={uploading ? "loader" : "camera"} size={28} color={colors.muted} />
              <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.muted }}>
                {uploading ? "Téléversement..." : "Ajouter une photo"}
              </Text>
            </View>
          )}
        </Pressable>

        <View style={{ gap: 16, marginTop: 20 }}>
          <TextField testID="meal-title" label="Nom du repas" value={title} onChangeText={setTitle} placeholder="ex : Pâtes italiennes maison" />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <TextField testID="meal-price" label="Prix / personne (€)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="5" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField testID="meal-guests" label="Invités max" value={maxGuests} onChangeText={setMaxGuests} keyboardType="number-pad" placeholder="4" />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <TextField testID="meal-date" label="Date (AAAA-MM-JJ)" value={date} onChangeText={setDate} placeholder="2026-07-01" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField testID="meal-time" label="Heure (HH:MM)" value={time} onChangeText={setTime} placeholder="19:30" />
            </View>
          </View>
          <TextField testID="meal-city" label="Ville" value={city} onChangeText={setCity} placeholder="Paris" />
          <TextField testID="meal-address" label="Adresse exacte (privée)" value={address} onChangeText={setAddress} placeholder="12 rue des Martyrs, 75009 Paris" />
          <TextField testID="meal-description" label="Description" value={description} onChangeText={setDescription} placeholder="Décris ton repas et l'ambiance..." multiline style={{ height: 100, textAlignVertical: "top", paddingTop: 12 }} />

          <View>
            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Type de cuisine</Text>
            <View style={styles.chips}>
              {CUISINES.map((c) => (
                <FilterChip key={c} label={c} selected={cuisine.includes(c)} onPress={() => toggle(cuisine, setCuisine, c)} testID={`cuisine-${c}`} />
              ))}
            </View>
          </View>
          <View>
            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Options alimentaires</Text>
            <View style={styles.chips}>
              {(config?.dietary_options ?? []).map((c) => (
                <FilterChip key={c} label={c} selected={dietary.includes(c)} onPress={() => toggle(dietary, setDietary, c)} testID={`dietary-${c}`} />
              ))}
            </View>
          </View>
          <View>
            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Centres d&apos;intérêt</Text>
            <View style={styles.chips}>
              {(config?.interests ?? []).map((c) => (
                <FilterChip key={c} label={c} selected={interests.includes(c)} onPress={() => toggle(interests, setInterests, c)} testID={`interest-${c}`} />
              ))}
            </View>
          </View>
          <TextField testID="meal-notes" label="Notes spéciales (optionnel)" value={notes} onChangeText={setNotes} placeholder="ex : Apportez votre bonne humeur !" />

          <AppButton testID="publish-meal-button" title="Publier le repas" onPress={publish} loading={saving} />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontFamily: fonts.bold, fontSize: 26 },
  photo: { height: 180, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  photoImg: { width: "100%", height: "100%" },
  label: { fontFamily: fonts.medium, fontSize: 13, marginBottom: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
});
