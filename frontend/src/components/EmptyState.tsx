import React from "react";
import { View, Text } from "react-native";
import { Icon } from "@/src/components/Icon";
import { AppButton } from "@/src/components/AppButton";
import { fonts, useTheme } from "@/src/theme";

export function EmptyState({
  icon = "inbox",
  title,
  subtitle,
  actionLabel,
  onAction,
  testID,
}: {
  icon?: React.ComponentProps<typeof Icon>["name"];
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      style={{ alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 32 }}
    >
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          backgroundColor: colors.brandTertiary,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <Icon name={icon} size={34} color={colors.onBrandTertiary} />
      </View>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: colors.onSurface, textAlign: "center" }}>
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{
            fontFamily: fonts.regular,
            fontSize: 14,
            color: colors.muted,
            textAlign: "center",
            marginTop: 8,
            lineHeight: 20,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: 24, alignSelf: "stretch" }}>
          <AppButton title={actionLabel} onPress={onAction} variant="secondary" testID="empty-action" />
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon="alert-triangle"
      title="Une erreur est survenue"
      subtitle="Impossible de charger les données pour le moment."
      actionLabel="Réessayer"
      onAction={onRetry}
      testID="error-state"
    />
  );
}
