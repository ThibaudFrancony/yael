import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { TextField } from "@/src/components/TextField";
import { AppButton } from "@/src/components/AppButton";
import { UserAvatar } from "@/src/components/UserAvatar";
import { fonts, useTheme } from "@/src/theme";
import { useAuth, User } from "@/src/auth/AuthContext";
import { api, uploadImage, resolveImage } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";

export default function EditProfile() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [city, setCity] = useState(user?.city || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(user?.avatar_url);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show("Autorise l'accès aux photos pour changer ton avatar.", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const up = await uploadImage(result.assets[0].uri);
      setAvatarUrl(up.url);
      toast.show("Photo mise à jour.", "success");
    } catch {
      toast.show("Échec du téléversement de la photo.", "error");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!firstName.trim()) {
      toast.show("Le prénom est requis.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await api.put<{ user: User }>("/users/me", {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        city: city.trim(),
        phone: phone.trim(),
        avatar_url: avatarUrl ?? undefined,
      });
      setUser(res.user);
      qc.invalidateQueries({ queryKey: ["my-meals"] });
      toast.show("Profil mis à jour.", "success");
      router.back();
    } catch {
      toast.show("Impossible d'enregistrer le profil.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable testID="edit-back-button" onPress={() => router.back()} hitSlop={10}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Modifier le profil</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <Pressable testID="change-avatar-button" onPress={pickPhoto} style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: resolveImage(avatarUrl) }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <UserAvatar name={firstName} size={96} />
            )}
            <View style={[styles.camBtn, { backgroundColor: colors.brandSecondary, borderColor: colors.surface }]}>
              {uploading ? (
                <ActivityIndicator color={colors.onBrandSecondary} size="small" />
              ) : (
                <Icon name="camera" size={16} color={colors.onBrandSecondary} />
              )}
            </View>
          </Pressable>
          <Text style={[styles.avatarHint, { color: colors.muted }]}>Appuie pour changer ta photo</Text>
        </View>

        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <TextField testID="edit-firstname" label="Prénom" value={firstName} onChangeText={setFirstName} />
            </View>
            <View style={{ flex: 1 }}>
              <TextField testID="edit-lastname" label="Nom" value={lastName} onChangeText={setLastName} />
            </View>
          </View>
          <TextField testID="edit-city" label="Ville" value={city} onChangeText={setCity} placeholder="Paris" />
          <TextField
            testID="edit-phone"
            label="Téléphone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+33 6 12 34 56 78"
          />
          <TextField label="Email" value={user?.email || ""} editable={false} />
          <AppButton testID="save-profile-button" title="Enregistrer" onPress={save} loading={saving} />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontFamily: fonts.semibold, fontSize: 18 },
  avatarWrap: { width: 96, height: 96 },
  avatarImg: { width: 96, height: 96, borderRadius: 48 },
  camBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  avatarHint: { fontFamily: fonts.regular, fontSize: 13, marginTop: 10 },
});
