import React from "react";
import { Text, Pressable, ActivityIndicator, ViewStyle, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Props = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "accent";
  style?: ViewStyle;
  testID?: string;
};

export function AppButton({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
  style,
  testID,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const bg =
    variant === "primary"
      ? colors.brandPrimary
      : variant === "accent"
        ? colors.brandSecondary
        : colors.surfaceSecondary;
  const fg =
    variant === "secondary" ? colors.onSurface : "#FFFFFF";

  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (isDisabled) return;
        if (Platform.OS !== "web") Haptics.selectionAsync();
        onPress();
      }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === "secondary" && styles.secondaryBorder,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.label, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  btn: {
    height: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    flexDirection: "row",
  },
  secondaryBorder: { borderWidth: 1, borderColor: colors.border },
  label: { fontFamily: fonts.semibold, fontSize: 16 },
}));
