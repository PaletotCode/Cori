import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  View,
} from "react-native";

import { appColors, bottomTabContract } from "./navigationTheme";
import { screenMotionContract } from "./screenMotionContract";
import { typographyContract } from "./typography";

export interface BottomTabIconNamePair {
  outline: keyof typeof Ionicons.glyphMap;
  filled: keyof typeof Ionicons.glyphMap;
}

interface BottomTabIconProps {
  focused: boolean;
  icons: BottomTabIconNamePair;
  badgeCount?: number;
}

export function BottomTabButton(props: PressableProps) {
  const providedStyle = props.style;

  return (
    <Pressable
      {...props}
      // Regra 9: ripple nativo no Android + resposta visual imediata no iOS/Android.
      android_ripple={{ color: `${appColors.primary}1F`, borderless: false }}
      style={(state) => [
        typeof providedStyle === "function" ? providedStyle(state) : providedStyle,
        state.pressed ? styles.buttonPressed : undefined,
      ]}
    />
  );
}

export function BottomTabIcon({ focused, icons, badgeCount }: BottomTabIconProps) {
  // Regra 9: transicao suave ao alternar entre abas (outline -> filled com escala/opacity).
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: focused ? 1 : 0,
      duration: focused
        ? screenMotionContract.tabIconFocusDurationMs
        : screenMotionContract.tabIconBlurDurationMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [focused, progress]);

  const outlineOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 0],
  });
  const filledOpacity = progress;
  const iconScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  const showBadge = Number.isFinite(badgeCount) && (badgeCount ?? 0) > 0;
  const badgeText = (badgeCount ?? 0) > 99 ? "99+" : `${badgeCount ?? 0}`;

  return (
    <View style={styles.iconContainer}>
      <Animated.View
        style={[
          styles.iconLayer,
          {
            // Regra 4: inativo usa outline com menor opacidade.
            opacity: outlineOpacity,
            transform: [{ scale: iconScale }],
          },
        ]}
      >
        <Ionicons name={icons.outline} size={bottomTabContract.iconSize} color={appColors.text} />
      </Animated.View>

      <Animated.View
        style={[
          styles.iconLayer,
          styles.iconLayerAbsolute,
          {
            // Regra 4: ativo usa ícone filled com cor da marca.
            opacity: filledOpacity,
            transform: [{ scale: iconScale }],
          },
        ]}
      >
        <Ionicons name={icons.filled} size={bottomTabContract.iconSize} color={appColors.primary} />
      </Animated.View>

      {showBadge ? (
        // Regra 7: badge pequeno no canto superior direito com contorno sutil.
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeText}</Text>
        </View>
      ) : null}
    </View>
  );
}

interface BottomTabLabelProps {
  focused: boolean;
  label: string;
}

export function BottomTabLabel({ focused, label }: BottomTabLabelProps) {
  return (
    <Text
      // Regra 6: label curta e sempre em uma linha.
      numberOfLines={1}
      ellipsizeMode="clip"
      style={[styles.labelBase, focused ? styles.labelActive : styles.labelInactive]}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: bottomTabContract.iconSize,
    height: bottomTabContract.iconSize,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.72,
  },
  iconLayer: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconLayerAbsolute: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
  },
  labelBase: {
    fontSize: bottomTabContract.labelFontSize,
    lineHeight: 13,
    fontFamily: typographyContract.fontFamily,
    letterSpacing: 0.1,
    includeFontPadding: false,
  },
  // Regra 4: estado ativo com cor de destaque + semibold.
  labelActive: {
    color: appColors.primary,
    fontWeight: "600",
    opacity: 1,
  },
  // Regra 4: estado inativo com menor opacidade, mantendo contraste de leitura.
  labelInactive: {
    color: appColors.text,
    fontWeight: typographyContract.fontWeight,
    opacity: 0.72,
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#DC2626",
    borderWidth: 1,
    borderColor: appColors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: appColors.surface,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "700",
    includeFontPadding: false,
  },
});
