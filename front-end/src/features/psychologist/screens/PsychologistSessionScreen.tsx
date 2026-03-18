import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  StyleProp,
  Switch,
  Text,
  View,
  ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import { typographyContract } from "../../../shared/ui/typography";
import { appColors } from "../../../shared/ui/navigationTheme";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";
import { shellStyles } from "../../../shared/ui/shellStyles";
import { createActivitiesApiClient } from "../../activities/api/activitiesApiClient";
import type { ActivityItem } from "../../activities/api/types";
import { useAuthStore } from "../../auth/hooks/useAuthStore";
import { psychologistRoutes } from "../../navigation/guards";
import {
  createPracticeProfileApiClient,
  PracticeProfileApiError,
} from "../../practice-profile/api/practiceProfileApiClient";
import { createSessionsApiClient } from "../../sessions/api/sessionsApiClient";
import type { SessionAgendaItem } from "../../sessions/api/types";

const sessionsApiClient = createSessionsApiClient();
const activitiesApiClient = createActivitiesApiClient();
const practiceProfileApiClient = createPracticeProfileApiClient();

const COMPARISON_ORDER = ["yesterday", "weekAgo", "monthAgo"] as const;
type ComparisonKey = (typeof COMPARISON_ORDER)[number];
type MetricFormat = "count" | "currency";
type TrendDirection = "up" | "down" | "neutral";
type KpiCardId = "sessionsToday" | "pendingConfirmations" | "weeklyRevenue";
type DisplayMode = "dynamic" | "fixed";

interface CardPreferences {
  carouselEnabled: boolean;
  mode: DisplayMode;
  fixedItem: ComparisonKey;
  order: ComparisonKey[];
}

interface SessionComparisonBuckets {
  yesterdayDay: SessionAgendaItem[];
  weekAgoDay: SessionAgendaItem[];
  monthAgoDay: SessionAgendaItem[];
  yesterdayWeek: SessionAgendaItem[];
  weekAgoWeek: SessionAgendaItem[];
  monthAgoWeek: SessionAgendaItem[];
}

interface ComparisonItemView {
  key: ComparisonKey;
  trend: TrendDirection;
  color: string;
  text: string;
}

interface DashboardKpiCardDefinition {
  id: KpiCardId;
  title: string;
  format: MetricFormat;
  value: number | null;
  comparisonValues: Record<ComparisonKey, number | null>;
  nounSingular?: string;
  nounPlural?: string;
  emptyValueText: string;
  noCurrentDataText: string;
}

const comparisonLabel: Record<ComparisonKey, string> = {
  yesterday: "ontem",
  weekAgo: "semana passada",
  monthAgo: "mes passado",
};

const trendColor: Record<TrendDirection, string> = {
  up: "#027A48",
  down: "#B42318",
  neutral: "#667085",
};

const cardTitleById: Record<KpiCardId, string> = {
  sessionsToday: "Sessoes de hoje",
  pendingConfirmations: "Pendentes de confirmacao",
  weeklyRevenue: "Receita semanal prevista",
};

function createDefaultPreferences(): Record<KpiCardId, CardPreferences> {
  return {
    sessionsToday: {
      carouselEnabled: true,
      mode: "dynamic",
      fixedItem: "yesterday",
      order: [...COMPARISON_ORDER],
    },
    pendingConfirmations: {
      carouselEnabled: true,
      mode: "dynamic",
      fixedItem: "yesterday",
      order: [...COMPARISON_ORDER],
    },
    weeklyRevenue: {
      carouselEnabled: true,
      mode: "dynamic",
      fixedItem: "yesterday",
      order: [...COMPARISON_ORDER],
    },
  };
}

function toReferenceDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function addMonths(date: Date, amount: number): Date {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + amount);
  return nextDate;
}

function countNonCanceledSessions(sessions: SessionAgendaItem[]): number {
  return sessions.filter((session) => session.status !== "canceled").length;
}

function countPendingSessions(sessions: SessionAgendaItem[]): number {
  return sessions.filter(
    (session) => session.status === "scheduled" || session.status === "rescheduled",
  ).length;
}

function toWeekRevenue(sessions: SessionAgendaItem[], sessionPriceCents: number): number {
  return countNonCanceledSessions(sessions) * sessionPriceCents;
}

function sessionStatusStyle(status: SessionAgendaItem["status"]): {
  label: string;
  color: string;
  background: string;
} {
  if (status === "confirmed" || status === "completed") {
    return {
      label: status === "completed" ? "Concluida" : "Confirmada",
      color: "#027A48",
      background: "#D1FADF",
    };
  }
  if (status === "scheduled" || status === "rescheduled") {
    return {
      label: status === "rescheduled" ? "Remarcada" : "Agendada",
      color: "#B54708",
      background: "#FEF0C7",
    };
  }
  return { label: "Cancelada", color: appColors.danger, background: "#FEE4E2" };
}

function toDateLabel(dateTimeIso: string): string {
  return new Date(dateTimeIso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function trendIconName(trend: TrendDirection): keyof typeof Ionicons.glyphMap {
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

function buildComparisonView(params: {
  key: ComparisonKey;
  currentValue: number | null;
  baselineValue: number | null;
  format: MetricFormat;
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

function reorderComparison(order: ComparisonKey[], index: number, delta: number): ComparisonKey[] {
  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= order.length) {
    return order;
  }

  const nextOrder = [...order];
  const [moved] = nextOrder.splice(index, 1);
  nextOrder.splice(targetIndex, 0, moved);
  return nextOrder;
}

function TrendSparkline({ trend, color }: { trend: TrendDirection; color: string }) {
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

interface DashboardKpiCardProps {
  definition: DashboardKpiCardDefinition;
  preferences: CardPreferences;
  loading: boolean;
  comparisonError: string | null;
  onOpenPreferences: (cardId: KpiCardId) => void;
  cardStyle?: StyleProp<ViewStyle>;
}

function DashboardKpiCard({
  definition,
  preferences,
  loading,
  comparisonError,
  onOpenPreferences,
  cardStyle,
}: DashboardKpiCardProps) {
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
      accessibilityRole="button"
      accessibilityLabel={`Abrir configuracoes do card ${definition.title}`}
      onPress={() => onOpenPreferences(definition.id)}
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

interface KpiStackDeckProps {
  primaryDefinition: DashboardKpiCardDefinition;
  secondaryDefinition: DashboardKpiCardDefinition;
  primaryPreferences: CardPreferences;
  secondaryPreferences: CardPreferences;
  loading: boolean;
  comparisonError: string | null;
  onOpenPreferences: (cardId: KpiCardId) => void;
}

function KpiStackDeck({
  primaryDefinition,
  secondaryDefinition,
  primaryPreferences,
  secondaryPreferences,
  loading,
  comparisonError,
  onOpenPreferences,
}: KpiStackDeckProps) {
  const [frontCardIndex, setFrontCardIndex] = useState<0 | 1>(0);
  const [swapDirection, setSwapDirection] = useState<-1 | 1>(-1);
  const [interactionState, setInteractionState] = useState<
    "idle" | "tracking" | "settling" | "swapping"
  >("idle");
  const frontExitMotion = useRef(new Animated.Value(0)).current;
  const backEnterMotion = useRef(new Animated.Value(0)).current;
  const dragMotion = useRef(new Animated.Value(0)).current;
  const dragProgressMotion = useRef(new Animated.Value(0)).current;
  const isAnimatingRef = useRef(false);
  const isDraggingRef = useRef(false);

  const triggerSwap = useCallback(
    (direction: -1 | 1) => {
      if (isAnimatingRef.current) {
        return;
      }

      isAnimatingRef.current = true;
      isDraggingRef.current = false;
      setInteractionState("swapping");
      setSwapDirection(direction);

      frontExitMotion.stopAnimation();
      backEnterMotion.stopAnimation();
      dragMotion.stopAnimation();
      dragProgressMotion.stopAnimation();
      frontExitMotion.setValue(0);
      backEnterMotion.setValue(0);

      Animated.parallel([
        Animated.timing(dragMotion, {
          toValue: 0,
          duration: 120,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(dragProgressMotion, {
          toValue: 0,
          duration: 120,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(frontExitMotion, {
            toValue: 1,
            duration: 260,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(backEnterMotion, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]).start(({ finished }) => {
        frontExitMotion.setValue(0);
        backEnterMotion.setValue(0);
        dragMotion.setValue(0);
        dragProgressMotion.setValue(0);
        isAnimatingRef.current = false;
        setInteractionState("idle");

        if (!finished) {
          return;
        }

        setFrontCardIndex((current) => (current === 0 ? 1 : 0));
      });
    },
    [backEnterMotion, dragMotion, dragProgressMotion, frontExitMotion],
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (isDraggingRef.current || isAnimatingRef.current) {
        return;
      }
      triggerSwap(-1);
    }, 10000);

    return () => {
      clearInterval(intervalId);
    };
  }, [triggerSwap]);

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
          setInteractionState("tracking");
          dragMotion.stopAnimation();
          dragProgressMotion.stopAnimation();
          frontExitMotion.stopAnimation();
          backEnterMotion.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          if (!isDraggingRef.current || isAnimatingRef.current) {
            return;
          }
          const clampedDx = Math.max(-120, Math.min(120, gestureState.dx));
          dragMotion.setValue(clampedDx);
          dragProgressMotion.setValue(Math.min(1, Math.abs(clampedDx) / 120));
        },
        onPanResponderRelease: (_, gestureState) => {
          isDraggingRef.current = false;
          if (isAnimatingRef.current) {
            return;
          }

          const shouldGoForward = gestureState.dx < -44 || gestureState.vx < -0.38;
          const shouldGoBack = gestureState.dx > 44 || gestureState.vx > 0.38;

          if (shouldGoForward) {
            triggerSwap(-1);
            return;
          }
          if (shouldGoBack) {
            triggerSwap(1);
            return;
          }

          setInteractionState("settling");
          Animated.parallel([
            Animated.spring(dragMotion, {
              toValue: 0,
              damping: 18,
              stiffness: 220,
              mass: 0.8,
              useNativeDriver: true,
            }),
            Animated.spring(dragProgressMotion, {
              toValue: 0,
              damping: 18,
              stiffness: 220,
              mass: 0.8,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setInteractionState("idle");
          });
        },
        onPanResponderTerminate: () => {
          isDraggingRef.current = false;
          setInteractionState("settling");
          Animated.parallel([
            Animated.spring(dragMotion, {
              toValue: 0,
              damping: 18,
              stiffness: 220,
              mass: 0.8,
              useNativeDriver: true,
            }),
            Animated.spring(dragProgressMotion, {
              toValue: 0,
              damping: 18,
              stiffness: 220,
              mass: 0.8,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setInteractionState("idle");
          });
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [backEnterMotion, dragMotion, dragProgressMotion, frontExitMotion, triggerSwap],
  );

  const frontDefinition = frontCardIndex === 0 ? primaryDefinition : secondaryDefinition;
  const backDefinition = frontCardIndex === 0 ? secondaryDefinition : primaryDefinition;
  const frontPreferences = frontCardIndex === 0 ? primaryPreferences : secondaryPreferences;
  const backPreferences = frontCardIndex === 0 ? secondaryPreferences : primaryPreferences;

  const frontCardStyle = {
    transform: [
      {
        translateX: Animated.add(
          dragMotion.interpolate({
            inputRange: [-120, 0, 120],
            outputRange: [-22, 0, 22],
            extrapolate: "clamp",
          }),
          frontExitMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [0, swapDirection * 84],
          }),
        ),
      },
      {
        translateY: Animated.add(
          frontExitMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -7],
          }),
          dragProgressMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -3],
          }),
        ),
      },
      {
        scale: Animated.subtract(
          frontExitMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.925],
          }),
          dragProgressMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 0.028],
          }),
        ),
      },
      {
        rotateZ: dragMotion.interpolate({
          inputRange: [-120, 0, 120],
          outputRange: ["-2.8deg", "0deg", "2.8deg"],
          extrapolate: "clamp",
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
            outputRange: [-9, 0, 9],
            extrapolate: "clamp",
          }),
          backEnterMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [7, 0],
          }),
        ),
      },
      {
        translateY: Animated.subtract(
          backEnterMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [4, 0],
          }),
          dragProgressMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 3],
          }),
        ),
      },
      {
        scale: Animated.add(
          backEnterMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [0.945, 1],
          }),
          dragProgressMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 0.018],
          }),
        ),
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
  const backMaskDuringDrag = dragProgressMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0.84, 0.5],
  });

  return (
    <View style={styles.kpiDeckWrap} {...panResponder.panHandlers}>
      <Animated.View
        pointerEvents="auto"
        style={[styles.kpiDeckLayer, styles.kpiDeckFrontLayer, frontCardStyle]}
      >
        <DashboardKpiCard
          definition={frontDefinition}
          preferences={frontPreferences}
          loading={loading}
          comparisonError={comparisonError}
          onOpenPreferences={onOpenPreferences}
          cardStyle={styles.kpiDeckCard}
        />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[styles.kpiDeckLayer, styles.kpiDeckBackLayer, backCardStyle]}
      >
        <DashboardKpiCard
          definition={backDefinition}
          preferences={backPreferences}
          loading={loading}
          comparisonError={comparisonError}
          onOpenPreferences={onOpenPreferences}
          cardStyle={styles.kpiDeckCard}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.kpiDeckBackContentMask,
            {
              opacity: interactionState === "swapping" ? backMaskOpacity : backMaskDuringDrag,
            },
          ]}
        />
      </Animated.View>
    </View>
  );
}

export function PsychologistSessionScreen() {
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null);

  const [todaySessions, setTodaySessions] = useState<SessionAgendaItem[]>([]);
  const [weekSessions, setWeekSessions] = useState<SessionAgendaItem[]>([]);
  const [comparisonSessions, setComparisonSessions] = useState<SessionComparisonBuckets | null>(
    null,
  );
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [sessionPriceCents, setSessionPriceCents] = useState<number | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [hasLoadedSummary, setHasLoadedSummary] = useState(false);

  const [cardPreferences, setCardPreferences] =
    useState<Record<KpiCardId, CardPreferences>>(createDefaultPreferences);

  const [activeModalCardId, setActiveModalCardId] = useState<KpiCardId | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const modalMotion = useRef(new Animated.Value(0)).current;

  const updateCardPreferences = useCallback(
    (cardId: KpiCardId, updater: (current: CardPreferences) => CardPreferences) => {
      setCardPreferences((currentState) => ({
        ...currentState,
        [cardId]: updater(currentState[cardId]),
      }));
    },
    [],
  );

  const openCardPreferences = useCallback(
    (cardId: KpiCardId) => {
      setActiveModalCardId(cardId);
      setIsModalVisible(true);
      modalMotion.setValue(0);
      Animated.timing(modalMotion, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [modalMotion],
  );

  const closeCardPreferences = useCallback(() => {
    Animated.timing(modalMotion, {
      toValue: 0,
      duration: 190,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }
      setIsModalVisible(false);
      setActiveModalCardId(null);
    });
  }, [modalMotion]);

  const loadSummary = useCallback(async () => {
    if (accessToken === null) {
      return;
    }

    const referenceToday = new Date();
    const referenceDate = toReferenceDate(referenceToday);
    const referenceYesterday = toReferenceDate(addDays(referenceToday, -1));
    const referenceWeekAgo = toReferenceDate(addDays(referenceToday, -7));
    const referenceMonthAgo = toReferenceDate(addMonths(referenceToday, -1));

    setLoadingSummary(true);
    setSummaryError(null);
    setComparisonError(null);

    try {
      const [today, week, activities, profileData] = await Promise.all([
        sessionsApiClient.listAgenda(accessToken, { view: "day", referenceDate }),
        sessionsApiClient.listAgenda(accessToken, { view: "week", referenceDate }),
        activitiesApiClient.listActivities(accessToken, { limit: 200 }),
        practiceProfileApiClient.get(accessToken).catch((error) => {
          if (error instanceof PracticeProfileApiError && error.statusCode === 404) {
            return null;
          }
          throw error;
        }),
      ]);

      setTodaySessions(
        [...today].sort(
          (left, right) =>
            new Date(left.scheduledStartAt).getTime() - new Date(right.scheduledStartAt).getTime(),
        ),
      );
      setWeekSessions(week);
      setActivityItems(activities);
      setSessionPriceCents(profileData?.sessionPriceCents ?? null);
      setHasLoadedSummary(true);

      try {
        const [yesterdayDay, weekAgoDay, monthAgoDay, yesterdayWeek, weekAgoWeek, monthAgoWeek] =
          await Promise.all([
            sessionsApiClient.listAgenda(accessToken, {
              view: "day",
              referenceDate: referenceYesterday,
            }),
            sessionsApiClient.listAgenda(accessToken, {
              view: "day",
              referenceDate: referenceWeekAgo,
            }),
            sessionsApiClient.listAgenda(accessToken, {
              view: "day",
              referenceDate: referenceMonthAgo,
            }),
            sessionsApiClient.listAgenda(accessToken, {
              view: "week",
              referenceDate: referenceYesterday,
            }),
            sessionsApiClient.listAgenda(accessToken, {
              view: "week",
              referenceDate: referenceWeekAgo,
            }),
            sessionsApiClient.listAgenda(accessToken, {
              view: "week",
              referenceDate: referenceMonthAgo,
            }),
          ]);

        setComparisonSessions({
          yesterdayDay,
          weekAgoDay,
          monthAgoDay,
          yesterdayWeek,
          weekAgoWeek,
          monthAgoWeek,
        });
        setComparisonError(null);
      } catch {
        setComparisonSessions(null);
        setComparisonError("Nao foi possivel carregar a comparacao temporal.");
      }
    } catch (error) {
      setSummaryError(
        error instanceof Error ? error.message : "Falha ao carregar resumo do painel.",
      );
    } finally {
      setLoadingSummary(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const todayCount = countNonCanceledSessions(todaySessions);
  const todayPending = countPendingSessions(todaySessions);
  const recurringActivities = activityItems.filter((item) => item.recurrenceRule !== "none").length;

  const billableWeekSessions = countNonCanceledSessions(weekSessions);
  const estimatedWeekRevenue =
    sessionPriceCents === null ? null : toWeekRevenue(weekSessions, sessionPriceCents);

  const sessionsComparisonValues = useMemo(
    () => ({
      yesterday: comparisonSessions
        ? countNonCanceledSessions(comparisonSessions.yesterdayDay)
        : null,
      weekAgo: comparisonSessions ? countNonCanceledSessions(comparisonSessions.weekAgoDay) : null,
      monthAgo: comparisonSessions
        ? countNonCanceledSessions(comparisonSessions.monthAgoDay)
        : null,
    }),
    [comparisonSessions],
  );

  const pendingComparisonValues = useMemo(
    () => ({
      yesterday: comparisonSessions ? countPendingSessions(comparisonSessions.yesterdayDay) : null,
      weekAgo: comparisonSessions ? countPendingSessions(comparisonSessions.weekAgoDay) : null,
      monthAgo: comparisonSessions ? countPendingSessions(comparisonSessions.monthAgoDay) : null,
    }),
    [comparisonSessions],
  );

  const revenueComparisonValues = useMemo(() => {
    if (comparisonSessions === null || sessionPriceCents === null) {
      return {
        yesterday: null,
        weekAgo: null,
        monthAgo: null,
      };
    }

    return {
      yesterday: toWeekRevenue(comparisonSessions.yesterdayWeek, sessionPriceCents),
      weekAgo: toWeekRevenue(comparisonSessions.weekAgoWeek, sessionPriceCents),
      monthAgo: toWeekRevenue(comparisonSessions.monthAgoWeek, sessionPriceCents),
    };
  }, [comparisonSessions, sessionPriceCents]);

  const sessionsTodayDefinition: DashboardKpiCardDefinition = {
    id: "sessionsToday",
    title: "Sessoes de hoje",
    format: "count",
    value: hasLoadedSummary ? todayCount : null,
    comparisonValues: sessionsComparisonValues,
    nounSingular: "sessao",
    nounPlural: "sessoes",
    emptyValueText: loadingSummary ? "..." : "--",
    noCurrentDataText: "Sem dados de sessoes para comparar.",
  };

  const pendingDefinition: DashboardKpiCardDefinition = {
    id: "pendingConfirmations",
    title: "Pendentes de confirmacao",
    format: "count",
    value: hasLoadedSummary ? todayPending : null,
    comparisonValues: pendingComparisonValues,
    nounSingular: "pendencia",
    nounPlural: "pendencias",
    emptyValueText: loadingSummary ? "..." : "--",
    noCurrentDataText: "Sem pendencias suficientes para comparar.",
  };

  const weeklyRevenueDefinition: DashboardKpiCardDefinition = {
    id: "weeklyRevenue",
    title: "Receita semanal prevista",
    format: "currency",
    value: hasLoadedSummary ? estimatedWeekRevenue : null,
    comparisonValues: revenueComparisonValues,
    emptyValueText:
      loadingSummary || summaryError !== null ? "..." : "Defina o valor da sessao na configuracao.",
    noCurrentDataText: "Sem base de receita para comparacao.",
  };

  const upcomingToday = useMemo(
    () => todaySessions.filter((session) => session.status !== "canceled").slice(0, 4),
    [todaySessions],
  );

  const modalOverlayOpacity = modalMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const modalTranslateY = modalMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });

  const modalScale = modalMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  const selectedCardPreferences =
    activeModalCardId === null ? null : cardPreferences[activeModalCardId];

  const selectedCardTitle =
    activeModalCardId === null ? "" : (cardTitleById[activeModalCardId] ?? "Card");

  return (
    <ScreenFadeIn>
      <ScrollView contentContainerStyle={[styles.container, shellStyles.scrollContainer]}>
        <View style={styles.topKpiRow}>
          <View style={styles.topKpiColumn}>
            <DashboardKpiCard
              definition={sessionsTodayDefinition}
              preferences={cardPreferences.sessionsToday}
              loading={loadingSummary && !hasLoadedSummary}
              comparisonError={summaryError ?? comparisonError}
              onOpenPreferences={openCardPreferences}
              cardStyle={styles.topKpiCard}
            />
          </View>
          <View style={styles.topKpiColumn}>
            <KpiStackDeck
              primaryDefinition={pendingDefinition}
              secondaryDefinition={weeklyRevenueDefinition}
              primaryPreferences={cardPreferences.pendingConfirmations}
              secondaryPreferences={cardPreferences.weeklyRevenue}
              loading={loadingSummary && !hasLoadedSummary}
              comparisonError={summaryError ?? comparisonError}
              onOpenPreferences={openCardPreferences}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Agenda do dia</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(psychologistRoutes.agenda)}
            >
              <Text style={styles.sectionLink}>Ver agenda completa</Text>
            </Pressable>
          </View>

          {loadingSummary && !hasLoadedSummary ? (
            <Text style={styles.emptyText}>Carregando visao do dia...</Text>
          ) : summaryError ? (
            <Text style={styles.errorText}>{summaryError}</Text>
          ) : upcomingToday.length === 0 ? (
            <Text style={styles.emptyText}>Sem atendimentos programados para hoje.</Text>
          ) : (
            upcomingToday.map((session) => {
              const badge = sessionStatusStyle(session.status);
              return (
                <Pressable
                  key={session.id}
                  accessibilityRole="button"
                  onPress={() => router.push(psychologistRoutes.agenda)}
                  style={styles.sessionRow}
                >
                  <View style={styles.sessionRowMain}>
                    <Text style={styles.sessionPatient}>{session.patientName}</Text>
                    <Text style={styles.sessionTime}>
                      {toDateLabel(session.scheduledStartAt)} -{" "}
                      {toDateLabel(session.scheduledEndAt)}
                    </Text>
                  </View>
                  <View style={[styles.sessionBadge, { backgroundColor: badge.background }]}>
                    <Text style={[styles.sessionBadgeText, { color: badge.color }]}>
                      {badge.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={styles.financialCard}>
          <View style={styles.financialHeader}>
            <Ionicons name="cash-outline" size={16} color="#175CD3" />
            <Text style={styles.financialTitle}>Resumo de recorrencia e caixa</Text>
          </View>
          <Text style={styles.financialText}>
            Atividades recorrentes ativas:{" "}
            <Text style={styles.financialStrong}>{recurringActivities}</Text>
          </Text>
          <Text style={styles.financialText}>
            Sessoes previstas na semana:{" "}
            <Text style={styles.financialStrong}>{billableWeekSessions}</Text>
          </Text>
          <Text style={styles.financialHint}>
            A receita prevista considera o valor de sessao configurado e os atendimentos nao
            cancelados.
          </Text>
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={isModalVisible}
        animationType="none"
        onRequestClose={closeCardPreferences}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: modalOverlayOpacity }]}>
          <Pressable style={styles.modalBackdropTapZone} onPress={closeCardPreferences} />
          <Animated.View
            style={[
              styles.modalCard,
              {
                opacity: modalOverlayOpacity,
                transform: [{ translateY: modalTranslateY }, { scale: modalScale }],
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedCardTitle}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar configuracoes"
                onPress={closeCardPreferences}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close-outline" size={18} color="#344054" />
              </Pressable>
            </View>

            {activeModalCardId !== null && selectedCardPreferences !== null ? (
              <>
                <View style={styles.modalSection}>
                  <View style={styles.modalInlineRow}>
                    <Text style={styles.modalLabel}>Rotacao automatica</Text>
                    <Switch
                      value={selectedCardPreferences.carouselEnabled}
                      onValueChange={(enabled) =>
                        updateCardPreferences(activeModalCardId, (current) => ({
                          ...current,
                          carouselEnabled: enabled,
                        }))
                      }
                    />
                  </View>
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Modo de exibicao</Text>
                  <View style={styles.modalModeRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        updateCardPreferences(activeModalCardId, (current) => ({
                          ...current,
                          mode: "dynamic",
                        }))
                      }
                      style={[
                        styles.modalModeButton,
                        selectedCardPreferences.mode === "dynamic"
                          ? styles.modalModeButtonActive
                          : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalModeButtonText,
                          selectedCardPreferences.mode === "dynamic"
                            ? styles.modalModeButtonTextActive
                            : null,
                        ]}
                      >
                        Dinamico
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        updateCardPreferences(activeModalCardId, (current) => ({
                          ...current,
                          mode: "fixed",
                        }))
                      }
                      style={[
                        styles.modalModeButton,
                        selectedCardPreferences.mode === "fixed"
                          ? styles.modalModeButtonActive
                          : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalModeButtonText,
                          selectedCardPreferences.mode === "fixed"
                            ? styles.modalModeButtonTextActive
                            : null,
                        ]}
                      >
                        Fixo
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Item fixo</Text>
                  <View style={styles.modalFixedRow}>
                    {COMPARISON_ORDER.map((key) => (
                      <Pressable
                        key={key}
                        accessibilityRole="button"
                        onPress={() =>
                          updateCardPreferences(activeModalCardId, (current) => ({
                            ...current,
                            fixedItem: key,
                          }))
                        }
                        style={[
                          styles.modalFixedButton,
                          selectedCardPreferences.fixedItem === key
                            ? styles.modalFixedButtonActive
                            : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.modalFixedButtonText,
                            selectedCardPreferences.fixedItem === key
                              ? styles.modalFixedButtonTextActive
                              : null,
                          ]}
                        >
                          {comparisonLabel[key]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Ordem do carrossel</Text>
                  <View style={styles.modalOrderList}>
                    {selectedCardPreferences.order.map((key, index) => (
                      <View key={key} style={styles.modalOrderItem}>
                        <Text style={styles.modalOrderItemText}>{comparisonLabel[key]}</Text>
                        <View style={styles.modalOrderActions}>
                          <Pressable
                            accessibilityRole="button"
                            disabled={index === 0}
                            onPress={() =>
                              updateCardPreferences(activeModalCardId, (current) => ({
                                ...current,
                                order: reorderComparison(current.order, index, -1),
                              }))
                            }
                            style={[
                              styles.modalOrderButton,
                              index === 0 ? styles.modalOrderButtonDisabled : null,
                            ]}
                          >
                            <Ionicons name="chevron-up-outline" size={16} color="#344054" />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            disabled={index === selectedCardPreferences.order.length - 1}
                            onPress={() =>
                              updateCardPreferences(activeModalCardId, (current) => ({
                                ...current,
                                order: reorderComparison(current.order, index, 1),
                              }))
                            }
                            style={[
                              styles.modalOrderButton,
                              index === selectedCardPreferences.order.length - 1
                                ? styles.modalOrderButtonDisabled
                                : null,
                            ]}
                          >
                            <Ionicons name="chevron-down-outline" size={16} color="#344054" />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            ) : null}
          </Animated.View>
        </Animated.View>
      </Modal>
    </ScreenFadeIn>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  topKpiRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  topKpiColumn: {
    width: "48.5%",
  },
  topKpiCard: {
    minHeight: 112,
  },
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
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.32)",
  },
  modalBackdropTapZone: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: "94%",
    maxWidth: 380,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E7EC",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 26,
    gap: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 17,
    lineHeight: 24,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F4F7",
  },
  modalSection: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EAECF0",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  modalInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  modalLabel: {
    fontFamily: typographyContract.fontFamily,
    color: "#344054",
    fontSize: 13,
    lineHeight: 18,
  },
  modalModeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modalModeButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  modalModeButtonActive: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF3",
  },
  modalModeButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 12,
    lineHeight: 16,
  },
  modalModeButtonTextActive: {
    color: "#065F46",
  },
  modalFixedRow: {
    flexDirection: "row",
    gap: 7,
    flexWrap: "wrap",
  },
  modalFixedButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    minHeight: 32,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  modalFixedButtonActive: {
    borderColor: "#1D4ED8",
    backgroundColor: "#EFF6FF",
  },
  modalFixedButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 12,
    lineHeight: 16,
  },
  modalFixedButtonTextActive: {
    color: "#1D4ED8",
  },
  modalOrderList: {
    gap: 8,
  },
  modalOrderItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EAECF0",
    backgroundColor: "#F9FAFB",
    minHeight: 38,
    paddingLeft: 10,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modalOrderItemText: {
    fontFamily: typographyContract.fontFamily,
    color: "#344054",
    fontSize: 12,
    lineHeight: 17,
  },
  modalOrderActions: {
    flexDirection: "row",
    gap: 4,
  },
  modalOrderButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D0D5DD",
  },
  modalOrderButtonDisabled: {
    opacity: 0.35,
  },
  section: {
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E7EC",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: "#101828",
    fontSize: 16,
    fontWeight: "700",
  },
  sectionLink: {
    color: "#175CD3",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyText: {
    color: "#667085",
    fontSize: 13,
  },
  errorText: {
    color: appColors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  sessionRow: {
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#EAECF0",
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sessionRowMain: {
    flex: 1,
    gap: 2,
  },
  sessionPatient: {
    color: "#101828",
    fontSize: 14,
    fontWeight: "700",
  },
  sessionTime: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "600",
  },
  sessionBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    minHeight: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  financialCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#B2DDFF",
    backgroundColor: "#EFF8FF",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  financialHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  financialTitle: {
    color: "#1849A9",
    fontSize: 14,
    fontWeight: "700",
  },
  financialText: {
    color: "#1849A9",
    fontSize: 13,
  },
  financialStrong: {
    fontWeight: "700",
  },
  financialHint: {
    color: "#175CD3",
    fontSize: 12,
    lineHeight: 17,
  },
});
