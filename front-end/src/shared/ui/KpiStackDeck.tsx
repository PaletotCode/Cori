import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import { typographyContract } from "./typography";

export const KPI_DECK_COMPARISON_ORDER = ["yesterday", "weekAgo", "monthAgo"] as const;

export type KpiDeckComparisonKey = (typeof KPI_DECK_COMPARISON_ORDER)[number];
export type KpiDeckMetricFormat = "count" | "currency";
export type KpiDeckTrendDirection = "up" | "down" | "neutral";
export type KpiDeckDisplayMode = "dynamic" | "fixed";

export interface KpiDeckPreferences {
  carouselEnabled: boolean;
  mode: KpiDeckDisplayMode;
  fixedItem: KpiDeckComparisonKey;
  order: KpiDeckComparisonKey[];
}

export interface KpiDeckCardDefinition<CardId extends string = string> {
  id: CardId;
  title: string;
  format: KpiDeckMetricFormat;
  value: number | null;
  comparisonValues: Record<KpiDeckComparisonKey, number | null>;
  nounSingular?: string;
  nounPlural?: string;
  emptyValueText: string;
  noCurrentDataText: string;
}

interface ComparisonItemView {
  key: KpiDeckComparisonKey;
  trend: KpiDeckTrendDirection;
  color: string;
  text: string;
}

const comparisonLabel: Record<KpiDeckComparisonKey, string> = {
  yesterday: "ontem",
  weekAgo: "semana passada",
  monthAgo: "mes passado",
};

const trendColor: Record<KpiDeckTrendDirection, string> = {
  up: "#027A48",
  down: "#B42318",
  neutral: "#667085",
};

export function createDefaultKpiDeckPreferences<CardId extends string>(
  cardIds: readonly CardId[],
): Record<CardId, KpiDeckPreferences> {
  return cardIds.reduce<Record<CardId, KpiDeckPreferences>>(
    (acc, id) => {
      acc[id] = {
        carouselEnabled: true,
        mode: "dynamic",
        fixedItem: "yesterday",
        order: [...KPI_DECK_COMPARISON_ORDER],
      };
      return acc;
    },
    {} as Record<CardId, KpiDeckPreferences>,
  );
}

export function reorderKpiDeckComparisons(
  order: KpiDeckComparisonKey[],
  index: number,
  delta: number,
): KpiDeckComparisonKey[] {
  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= order.length) {
    return order;
  }

  const nextOrder = [...order];
  const [moved] = nextOrder.splice(index, 1);
  nextOrder.splice(targetIndex, 0, moved);
  return nextOrder;
}

function trendIconName(trend: KpiDeckTrendDirection): keyof typeof Ionicons.glyphMap {
  if (trend === "up") {
    return "trending-up-outline";
  }
  if (trend === "down") {
    return "trending-down-outline";
  }
  return "remove-outline";
}

function formatCountUnit(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function buildComparisonView(params: {
  key: KpiDeckComparisonKey;
  currentValue: number | null;
  baselineValue: number | null;
  format: KpiDeckMetricFormat;
  nounSingular?: string;
  nounPlural?: string;
  noCurrentDataText: string;
}): ComparisonItemView {
  const { key, currentValue, baselineValue, format, nounSingular, nounPlural, noCurrentDataText } =
    params;

  if (currentValue === null) {
    return {
      key,
      trend: "neutral",
      color: trendColor.neutral,
      text: noCurrentDataText,
    };
  }

  if (baselineValue === null) {
    return {
      key,
      trend: "neutral",
      color: trendColor.neutral,
      text: `Sem base de ${comparisonLabel[key]}.`,
    };
  }

  const delta = currentValue - baselineValue;
  if (delta === 0) {
    return {
      key,
      trend: "neutral",
      color: trendColor.neutral,
      text: `Igual a ${comparisonLabel[key]}.`,
    };
  }

  const absDelta = Math.abs(delta);
  const amount =
    format === "currency"
      ? formatCurrency(absDelta)
      : formatCountUnit(absDelta, nounSingular ?? "item", nounPlural ?? "itens");

  if (delta > 0) {
    return {
      key,
      trend: "up",
      color: trendColor.up,
      text: `${amount} acima de ${comparisonLabel[key]}`,
    };
  }

  return {
    key,
    trend: "down",
    color: trendColor.down,
    text: `${amount} abaixo de ${comparisonLabel[key]}`,
  };
}

function TrendSparkline({ trend, color }: { trend: KpiDeckTrendDirection; color: string }) {
  const linePath =
    trend === "up"
      ? "M2 16 L11 11 L20 13 L30 7 L42 4"
      : trend === "down"
        ? "M2 4 L11 8 L20 10 L30 14 L42 16"
        : "M2 10 L12 10 L22 9.5 L32 10.5 L42 10";

  return (
    <Svg width={34} height={16} viewBox="0 0 44 20" fill="none">
      <Path d="M2 10 H42" stroke="#E4E7EC" strokeWidth={1.2} strokeLinecap="round" />
      <Path
        d={linePath}
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

interface KpiDeckCardProps<CardId extends string = string> {
  definition: KpiDeckCardDefinition<CardId>;
  preferences: KpiDeckPreferences;
  loading: boolean;
  comparisonError: string | null;
  onPressCard?: (cardId: CardId) => void;
  cardStyle?: StyleProp<ViewStyle>;
}

export function KpiDeckCard<CardId extends string = string>({
  definition,
  preferences,
  loading,
  comparisonError,
  onPressCard,
  cardStyle,
}: KpiDeckCardProps<CardId>) {
  const fadeMotion = useRef(new Animated.Value(1)).current;
  const [activeDynamicIndex, setActiveDynamicIndex] = useState(0);

  const orderSignature = useMemo(() => preferences.order.join("|"), [preferences.order]);

  const comparisonItems = useMemo(() => {
    if (loading) {
      return preferences.order.map((key) => ({
        key,
        trend: "neutral" as const,
        color: trendColor.neutral,
        text: "Carregando comparativo...",
      }));
    }

    if (comparisonError !== null) {
      return preferences.order.map((key) => ({
        key,
        trend: "neutral" as const,
        color: trendColor.neutral,
        text: "Comparativo indisponivel no momento.",
      }));
    }

    return preferences.order.map((key) =>
      buildComparisonView({
        key,
        currentValue: definition.value,
        baselineValue: definition.comparisonValues[key],
        format: definition.format,
        nounSingular: definition.nounSingular,
        nounPlural: definition.nounPlural,
        noCurrentDataText: definition.noCurrentDataText,
      }),
    );
  }, [
    comparisonError,
    definition.comparisonValues,
    definition.format,
    definition.noCurrentDataText,
    definition.nounPlural,
    definition.nounSingular,
    definition.value,
    loading,
    preferences.order,
  ]);

  const shouldRotate =
    preferences.mode === "dynamic" &&
    preferences.carouselEnabled &&
    comparisonItems.length > 1 &&
    !loading;

  useEffect(() => {
    setActiveDynamicIndex(0);
    fadeMotion.setValue(1);
  }, [fadeMotion, orderSignature, preferences.carouselEnabled, preferences.mode]);

  useEffect(() => {
    if (!shouldRotate) {
      return;
    }

    const intervalId = setInterval(() => {
      Animated.timing(fadeMotion, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }

        setActiveDynamicIndex((currentIndex) =>
          comparisonItems.length === 0 ? 0 : (currentIndex + 1) % comparisonItems.length,
        );

        Animated.timing(fadeMotion, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    }, 5600);

    return () => {
      clearInterval(intervalId);
    };
  }, [comparisonItems.length, fadeMotion, shouldRotate]);

  const visibleComparison = useMemo(() => {
    if (comparisonItems.length === 0) {
      return {
        key: "yesterday" as const,
        trend: "neutral" as const,
        color: trendColor.neutral,
        text: "Sem dados comparativos.",
      };
    }

    if (preferences.mode === "fixed") {
      return (
        comparisonItems.find((item) => item.key === preferences.fixedItem) ?? comparisonItems[0]
      );
    }

    return comparisonItems[Math.min(activeDynamicIndex, comparisonItems.length - 1)];
  }, [activeDynamicIndex, comparisonItems, preferences.fixedItem, preferences.mode]);

  const valueText =
    definition.value === null
      ? definition.emptyValueText
      : definition.format === "currency"
        ? formatCurrency(definition.value)
        : String(definition.value);

  const translateY = fadeMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [5, 0],
  });

  return (
    <Pressable
      accessibilityRole={onPressCard ? "button" : undefined}
      accessibilityLabel={onPressCard ? `Abrir card ${definition.title}` : undefined}
      onPress={onPressCard ? () => onPressCard(definition.id) : undefined}
      style={({ pressed }) => [styles.kpiCard, cardStyle, pressed ? styles.kpiCardPressed : null]}
    >
      <Text numberOfLines={2} style={styles.kpiLabel}>
        {definition.title}
      </Text>
      <Text numberOfLines={1} style={styles.kpiValue}>
        {valueText}
      </Text>

      <Animated.View
        style={[
          styles.kpiComparisonContainer,
          {
            opacity: fadeMotion,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.kpiTrendRow}>
          <TrendSparkline trend={visibleComparison.trend} color={visibleComparison.color} />
          <Ionicons
            name={trendIconName(visibleComparison.trend)}
            size={15}
            color={visibleComparison.color}
          />
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.kpiComparisonText, { color: visibleComparison.color }]}
          >
            {visibleComparison.text}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

interface KpiStackDeckProps<CardId extends string = string> {
  primaryDefinition: KpiDeckCardDefinition<CardId>;
  secondaryDefinition: KpiDeckCardDefinition<CardId>;
  primaryPreferences: KpiDeckPreferences;
  secondaryPreferences: KpiDeckPreferences;
  loading: boolean;
  comparisonError: string | null;
  onPressCard?: (cardId: CardId) => void;
  deckStyle?: StyleProp<ViewStyle>;
  cardStyle?: StyleProp<ViewStyle>;
  autoSwapMs?: number;
}

export function KpiStackDeck<CardId extends string = string>({
  primaryDefinition,
  secondaryDefinition,
  primaryPreferences,
  secondaryPreferences,
  loading,
  comparisonError,
  onPressCard,
  deckStyle,
  cardStyle,
  autoSwapMs = 10000,
}: KpiStackDeckProps<CardId>) {
  const MAX_DRAG_DX = 120;
  const DRAG_TO_CARD_X_DIVISOR = 10;
  const FRONT_EXIT_X = 84;

  const [frontCardIndex, setFrontCardIndex] = useState<0 | 1>(0);
  const [pendingCardIndex, setPendingCardIndex] = useState<0 | 1 | null>(null);
  const [swapDirection, setSwapDirection] = useState<-1 | 1>(-1);
  const frontExitMotion = useRef(new Animated.Value(0)).current;
  const backEnterMotion = useRef(new Animated.Value(0)).current;
  const dragMotion = useRef(new Animated.Value(0)).current;
  const isAnimatingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const resetFrameRef = useRef<number | null>(null);

  const resetDeckMotions = useCallback(() => {
    frontExitMotion.setValue(0);
    backEnterMotion.setValue(0);
    dragMotion.setValue(0);
  }, [backEnterMotion, dragMotion, frontExitMotion]);

  const scheduleResetAfterSwap = useCallback(() => {
    if (resetFrameRef.current !== null) {
      cancelAnimationFrame(resetFrameRef.current);
    }
    resetFrameRef.current = requestAnimationFrame(() => {
      resetFrameRef.current = requestAnimationFrame(() => {
        resetDeckMotions();
        resetFrameRef.current = null;
      });
    });
  }, [resetDeckMotions]);

  useEffect(() => {
    return () => {
      if (resetFrameRef.current !== null) {
        cancelAnimationFrame(resetFrameRef.current);
      }
    };
  }, []);

  const triggerSwap = useCallback(
    (direction: -1 | 1, dragDxAtRelease = 0) => {
      if (isAnimatingRef.current) {
        return;
      }

      const nextCardIndex: 0 | 1 = frontCardIndex === 0 ? 1 : 0;
      isAnimatingRef.current = true;
      isDraggingRef.current = false;
      setSwapDirection(direction);
      setPendingCardIndex(nextCardIndex);

      const clampedDragDx = Math.max(-MAX_DRAG_DX, Math.min(MAX_DRAG_DX, dragDxAtRelease));
      const releaseCardOffsetX = clampedDragDx / DRAG_TO_CARD_X_DIVISOR;
      const startProgress = Math.min(0.32, Math.abs(releaseCardOffsetX) / FRONT_EXIT_X);
      const frontExitDuration = Math.max(120, Math.round(260 * (1 - startProgress)));

      frontExitMotion.stopAnimation();
      backEnterMotion.stopAnimation();
      dragMotion.stopAnimation();
      if (resetFrameRef.current !== null) {
        cancelAnimationFrame(resetFrameRef.current);
        resetFrameRef.current = null;
      }
      dragMotion.setValue(0);
      frontExitMotion.setValue(startProgress);
      backEnterMotion.setValue(0);

      Animated.sequence([
        Animated.timing(frontExitMotion, {
          toValue: 1,
          duration: frontExitDuration,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backEnterMotion, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        isAnimatingRef.current = false;

        if (!finished) {
          setPendingCardIndex(null);
          resetDeckMotions();
          return;
        }

        setFrontCardIndex(nextCardIndex);
        setPendingCardIndex(null);
        scheduleResetAfterSwap();
      });
    },
    [
      FRONT_EXIT_X,
      MAX_DRAG_DX,
      DRAG_TO_CARD_X_DIVISOR,
      backEnterMotion,
      dragMotion,
      frontCardIndex,
      frontExitMotion,
      resetDeckMotions,
      scheduleResetAfterSwap,
    ],
  );

  const activeDeckPreferences =
    frontCardIndex === 0 ? primaryPreferences : secondaryPreferences;
  const shouldAutoplayDeck =
    activeDeckPreferences.carouselEnabled && activeDeckPreferences.mode === "dynamic";

  useEffect(() => {
    if (!shouldAutoplayDeck) {
      return;
    }
    const intervalId = setInterval(() => {
      if (isDraggingRef.current || isAnimatingRef.current) {
        return;
      }
      triggerSwap(-1);
    }, autoSwapMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [autoSwapMs, shouldAutoplayDeck, triggerSwap]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderGrant: () => {
          if (isAnimatingRef.current) {
            return;
          }
          isDraggingRef.current = true;
          dragMotion.stopAnimation();
          frontExitMotion.stopAnimation();
          backEnterMotion.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          if (!isDraggingRef.current || isAnimatingRef.current) {
            return;
          }
          const clampedDx = Math.max(-MAX_DRAG_DX, Math.min(MAX_DRAG_DX, gestureState.dx));
          dragMotion.setValue(clampedDx);
        },
        onPanResponderRelease: (_, gestureState) => {
          isDraggingRef.current = false;
          if (isAnimatingRef.current) {
            return;
          }

          const shouldGoForward = gestureState.dx < -44 || gestureState.vx < -0.38;
          const shouldGoBack = gestureState.dx > 44 || gestureState.vx > 0.38;

          if (shouldGoForward) {
            triggerSwap(-1, gestureState.dx);
            return;
          }
          if (shouldGoBack) {
            triggerSwap(1, gestureState.dx);
            return;
          }

          Animated.spring(dragMotion, {
            toValue: 0,
            damping: 18,
            stiffness: 220,
            mass: 0.8,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          isDraggingRef.current = false;
          Animated.spring(dragMotion, {
            toValue: 0,
            damping: 18,
            stiffness: 220,
            mass: 0.8,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [MAX_DRAG_DX, backEnterMotion, dragMotion, frontExitMotion, triggerSwap],
  );

  const frontDefinition = frontCardIndex === 0 ? primaryDefinition : secondaryDefinition;
  const frontPreferences = activeDeckPreferences;
  const backDefinition = pendingCardIndex === 0 ? primaryDefinition : secondaryDefinition;
  const backPreferences = pendingCardIndex === 0 ? primaryPreferences : secondaryPreferences;
  const isSwapActive = pendingCardIndex !== null;

  const frontCardStyle = {
    transform: [
      {
        translateX: Animated.add(
          dragMotion.interpolate({
            inputRange: [-120, 0, 120],
            outputRange: [-12, 0, 12],
            extrapolate: "clamp",
          }),
          frontExitMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [0, swapDirection * FRONT_EXIT_X],
          }),
        ),
      },
      {
        translateY: frontExitMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -7],
        }),
      },
      {
        scale: frontExitMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.925],
        }),
      },
      {
        rotateZ: frontExitMotion.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", `${swapDirection * 5}deg`],
        }),
      },
    ],
    opacity: frontExitMotion.interpolate({
      inputRange: [0, 0.72, 1],
      outputRange: [1, 1, 0],
    }),
  };

  const backCardStyle = {
    transform: [
      {
        translateX: Animated.add(
          dragMotion.interpolate({
            inputRange: [-120, 0, 120],
            outputRange: [-4, 0, 4],
            extrapolate: "clamp",
          }),
          backEnterMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [7, 0],
          }),
        ),
      },
      {
        translateY: backEnterMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [4, 0],
        }),
      },
      {
        scale: backEnterMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0.945, 1],
        }),
      },
      {
        rotateZ: backEnterMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [`${swapDirection * -1.2}deg`, "0deg"],
        }),
      },
    ],
  };

  const backMaskOpacity = backEnterMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0.84, 0],
  });

  return (
    <View style={[styles.kpiDeckWrap, deckStyle]} {...panResponder.panHandlers}>
      <Animated.View
        pointerEvents="auto"
        style={[
          styles.kpiDeckLayer,
          styles.kpiDeckFrontLayer,
          isSwapActive ? frontCardStyle : null,
        ]}
      >
        <KpiDeckCard
          key={`front-${String(frontDefinition.id)}`}
          definition={frontDefinition}
          preferences={frontPreferences}
          loading={loading}
          comparisonError={comparisonError}
          onPressCard={onPressCard}
          cardStyle={[styles.kpiDeckCard, cardStyle]}
        />
      </Animated.View>

      {isSwapActive ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.kpiDeckLayer, styles.kpiDeckBackLayer, backCardStyle]}
        >
          <KpiDeckCard
            key={`back-${String(backDefinition.id)}`}
            definition={backDefinition}
            preferences={backPreferences}
            loading={loading}
            comparisonError={comparisonError}
            onPressCard={onPressCard}
            cardStyle={[styles.kpiDeckCard, cardStyle]}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.kpiDeckBackContentMask, { opacity: backMaskOpacity }]}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  kpiDeckWrap: {
    height: 112,
    borderRadius: 18,
    overflow: "hidden",
  },
  kpiDeckLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backfaceVisibility: "hidden",
  },
  kpiDeckFrontLayer: {
    zIndex: 3,
  },
  kpiDeckBackLayer: {
    zIndex: 2,
  },
  kpiDeckCard: {
    minHeight: 112,
  },
  kpiDeckBackContentMask: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  kpiCard: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    backfaceVisibility: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 112,
    justifyContent: "space-between",
    gap: 6,
  },
  kpiCardPressed: {
    transform: [{ scale: 0.992 }],
    opacity: 0.98,
  },
  kpiLabel: {
    fontFamily: typographyContract.fontFamily,
    color: "#344054",
    fontSize: 12,
    lineHeight: 16,
  },
  kpiValue: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 24,
    lineHeight: 29,
  },
  kpiComparisonContainer: {
    minHeight: 26,
    justifyContent: "center",
  },
  kpiTrendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  kpiComparisonText: {
    flex: 1,
    fontFamily: typographyContract.fontFamily,
    fontSize: 10.5,
    lineHeight: 14,
  },
});
