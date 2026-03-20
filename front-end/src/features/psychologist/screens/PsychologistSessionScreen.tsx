import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  InteractionManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  StyleProp,
  Switch,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import { typographyContract } from "../../../shared/ui/typography";
import { appColors } from "../../../shared/ui/navigationTheme";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";
import { shellStyles } from "../../../shared/ui/shellStyles";
import { useNotificationsStore } from "../../notifications/hooks/useNotificationsStore";
import { toDateKeyFromDate, toDateKeyFromIso } from "../../sessions/components/apple-calendar/dateUtils";
import { createActivitiesApiClient } from "../../activities/api/activitiesApiClient";
import type { ActivityItem } from "../../activities/api/types";
import { useAuthStore } from "../../auth/hooks/useAuthStore";
import { psychologistRoutes } from "../../navigation/guards";
import { PanelAgendaDayPreview } from "../components/PanelAgendaDayPreview";
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

const REALTIME_REFRESH_EVENTS = new Set<string>([
  "activity_assigned",
  "form_assigned",
  "session_created",
  "session_confirm",
  "session_reschedule",
  "session_cancel",
  "session_complete",
  "session_confirmed_by_patient",
]);

interface SessionPanelCache {
  todaySessions: SessionAgendaItem[];
  weekSessions: SessionAgendaItem[];
  comparisonSessions: SessionComparisonBuckets | null;
  activityItems: ActivityItem[];
  sessionPriceCents: number | null;
  hasLoadedSummary: boolean;
}

let sessionPanelCache: SessionPanelCache | null = null;
const PANEL_REQUEST_ABORTED_ERROR_NAME = "PsychologistPanelRequestAborted";

function createPanelRequestAbortedError(): Error {
  const error = new Error("Solicitacao interrompida.");
  error.name = PANEL_REQUEST_ABORTED_ERROR_NAME;
  return error;
}

function isPanelRequestAbortedError(error: unknown): boolean {
  return error instanceof Error && error.name === PANEL_REQUEST_ABORTED_ERROR_NAME;
}

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
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
            numberOfLines={2}
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
  deckHeight: number;
  loading: boolean;
  comparisonError: string | null;
  onOpenPreferences: (cardId: KpiCardId) => void;
}

function KpiStackDeck({
  primaryDefinition,
  secondaryDefinition,
  primaryPreferences,
  secondaryPreferences,
  deckHeight,
  loading,
  comparisonError,
  onOpenPreferences,
}: KpiStackDeckProps) {
  const [deckWidth, setDeckWidth] = useState(0);
  const carouselRef = useRef<ScrollView | null>(null);
  const activeIndexRef = useRef<0 | 1>(0);
  const autoplayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shouldAutoplayForIndex = useCallback(
    (index: 0 | 1) => {
      const currentPreferences = index === 0 ? primaryPreferences : secondaryPreferences;
      return currentPreferences.carouselEnabled && currentPreferences.mode === "dynamic";
    },
    [primaryPreferences, secondaryPreferences],
  );

  const clearAutoplayTimeout = useCallback(() => {
    if (autoplayTimeoutRef.current !== null) {
      clearTimeout(autoplayTimeoutRef.current);
      autoplayTimeoutRef.current = null;
    }
  }, []);

  const scheduleAutoplay = useCallback(() => {
    clearAutoplayTimeout();

    if (deckWidth <= 0) {
      return;
    }
    if (!shouldAutoplayForIndex(activeIndexRef.current)) {
      return;
    }

    autoplayTimeoutRef.current = setTimeout(() => {
      const nextIndex: 0 | 1 = activeIndexRef.current === 0 ? 1 : 0;
      activeIndexRef.current = nextIndex;
      carouselRef.current?.scrollTo({
        x: nextIndex * deckWidth,
        animated: true,
      });
      scheduleAutoplay();
    }, 10000);
  }, [clearAutoplayTimeout, deckWidth, shouldAutoplayForIndex]);

  useEffect(() => {
    scheduleAutoplay();
    return () => {
      clearAutoplayTimeout();
    };
  }, [clearAutoplayTimeout, scheduleAutoplay]);

  useEffect(() => {
    if (deckWidth <= 0) {
      return;
    }
    carouselRef.current?.scrollTo({
      x: activeIndexRef.current * deckWidth,
      animated: false,
    });
  }, [deckWidth]);

  const handleSwipeStart = useCallback(() => {
    // 🚀 PERFORMANCE: ao interagir manualmente, reinicia a janela de autoplay para evitar disputa com o gesto.
    clearAutoplayTimeout();
  }, [clearAutoplayTimeout]);

  const handleSwipeFinish = useCallback(
    (offsetX: number) => {
      if (deckWidth > 0) {
        activeIndexRef.current = Math.round(offsetX / deckWidth) >= 1 ? 1 : 0;
      }
      // 🚀 PERFORMANCE: reinicia autoplay apos gesto do usuario (reset de 10s).
      scheduleAutoplay();
    },
    [deckWidth, scheduleAutoplay],
  );

  return (
    <View
      style={[styles.kpiDeckWrap, { height: deckHeight }]}
      onLayout={({ nativeEvent }) => {
        const nextWidth = nativeEvent.layout.width;
        if (nextWidth > 0 && Math.abs(nextWidth - deckWidth) > 0.5) {
          setDeckWidth(nextWidth);
        }
      }}
    >
      <ScrollView
        ref={carouselRef}
        horizontal
        pagingEnabled
        bounces={false}
        directionalLockEnabled
        decelerationRate="fast"
        scrollEventThrottle={16}
        snapToAlignment="start"
        snapToInterval={deckWidth > 0 ? deckWidth : undefined}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.kpiDeckCarouselContent}
        onScrollBeginDrag={handleSwipeStart}
        onScrollEndDrag={(event) => {
          const targetOffset = event.nativeEvent.targetContentOffset?.x;
          handleSwipeFinish(
            typeof targetOffset === "number" ? targetOffset : event.nativeEvent.contentOffset.x,
          );
        }}
        onMomentumScrollEnd={(event) => {
          handleSwipeFinish(event.nativeEvent.contentOffset.x);
        }}
      >
        <View
          style={[
            styles.kpiDeckSlide,
            { height: deckHeight },
            deckWidth > 0 ? { width: deckWidth } : undefined,
          ]}
        >
          <DashboardKpiCard
            definition={primaryDefinition}
            preferences={primaryPreferences}
            loading={loading}
            comparisonError={comparisonError}
            onOpenPreferences={onOpenPreferences}
            cardStyle={[styles.kpiDeckCard, { minHeight: deckHeight }]}
          />
        </View>

        <View
          style={[
            styles.kpiDeckSlide,
            { height: deckHeight },
            deckWidth > 0 ? { width: deckWidth } : undefined,
          ]}
        >
          <DashboardKpiCard
            definition={secondaryDefinition}
            preferences={secondaryPreferences}
            loading={loading}
            comparisonError={comparisonError}
            onOpenPreferences={onOpenPreferences}
            cardStyle={[styles.kpiDeckCard, { minHeight: deckHeight }]}
          />
        </View>
      </ScrollView>
    </View>
  );
}

export function PsychologistSessionScreen() {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null);
  const latestNotification = useNotificationsStore((state) => state.items[0] ?? null);

  const [todaySessions, setTodaySessions] = useState<SessionAgendaItem[]>(
    () => sessionPanelCache?.todaySessions ?? [],
  );
  const [weekSessions, setWeekSessions] = useState<SessionAgendaItem[]>(
    () => sessionPanelCache?.weekSessions ?? [],
  );
  const [comparisonSessions, setComparisonSessions] = useState<SessionComparisonBuckets | null>(
    () => sessionPanelCache?.comparisonSessions ?? null,
  );
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>(
    () => sessionPanelCache?.activityItems ?? [],
  );
  const [sessionPriceCents, setSessionPriceCents] = useState<number | null>(
    () => sessionPanelCache?.sessionPriceCents ?? null,
  );
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [hasLoadedSummary, setHasLoadedSummary] = useState(
    () => sessionPanelCache?.hasLoadedSummary ?? false,
  );

  const [cardPreferences, setCardPreferences] =
    useState<Record<KpiCardId, CardPreferences>>(createDefaultPreferences);
  const [selectedPanelDateKey, setSelectedPanelDateKey] = useState(() => toDateKeyFromDate(new Date()));
  const [agendaSessionModalId, setAgendaSessionModalId] = useState<string | null>(null);

  const [activeModalCardId, setActiveModalCardId] = useState<KpiCardId | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const modalMotion = useRef(new Animated.Value(0)).current;
  const hasLoadedSummaryRef = useRef(hasLoadedSummary);
  const isMountedRef = useRef(true);
  const loadSummaryRequestIdRef = useRef(0);
  const lastHandledRealtimeNotificationIdRef = useRef<string | null>(null);

  useEffect(() => {
    hasLoadedSummaryRef.current = hasLoadedSummary;
  }, [hasLoadedSummary]);

  useEffect(() => {
    // 🚀 PERFORMANCE: cleanup centralizado invalida requisicoes pendentes apos unmount.
    return () => {
      isMountedRef.current = false;
      loadSummaryRequestIdRef.current += 1;
    };
  }, []);

  const sortSessionsOnRuntime = useCallback(async (sessions: SessionAgendaItem[]) => {
    // 🚀 PERFORMANCE: adia ordenação para depois das interacoes ativas, evitando competir com animacoes de navegacao.
    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });
    return [...sessions].sort(
      (left, right) =>
        new Date(left.scheduledStartAt).getTime() - new Date(right.scheduledStartAt).getTime(),
    );
  }, []);

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

    const requestId = ++loadSummaryRequestIdRef.current;
    const referenceToday = new Date();
    const referenceDate = toReferenceDate(referenceToday);
    const referenceYesterday = toReferenceDate(addDays(referenceToday, -1));
    const referenceWeekAgo = toReferenceDate(addDays(referenceToday, -7));
    const referenceMonthAgo = toReferenceDate(addMonths(referenceToday, -1));

    const assertRequestActive = () => {
      if (requestId !== loadSummaryRequestIdRef.current || !isMountedRef.current) {
        throw createPanelRequestAbortedError();
      }
    };

    setLoadingSummary(!hasLoadedSummaryRef.current);
    setSummaryError(null);
    setComparisonError(null);

    try {
      const [today, week] = await Promise.all([
        sessionsApiClient.listAgenda(accessToken, { view: "day", referenceDate }),
        sessionsApiClient.listAgenda(accessToken, { view: "week", referenceDate }),
      ]);
      assertRequestActive();

      const sortedToday = await sortSessionsOnRuntime(today);
      assertRequestActive();

      const [activitiesResult, profileResult] = await Promise.allSettled([
        activitiesApiClient.listActivities(accessToken, { limit: 200 }),
        practiceProfileApiClient.get(accessToken).catch((error) => {
          if (error instanceof PracticeProfileApiError && error.statusCode === 404) {
            return null;
          }
          throw error;
        }),
      ]);
      assertRequestActive();

      // 🚀 PERFORMANCE: lote de atualização não urgente evita cascata de render durante sincronização do painel.
      startTransition(() => {
        setTodaySessions(sortedToday);
        setWeekSessions(week);
        setActivityItems(activitiesResult.status === "fulfilled" ? activitiesResult.value : []);
        setSessionPriceCents(
          profileResult.status === "fulfilled" ? (profileResult.value?.sessionPriceCents ?? null) : null,
        );
        setHasLoadedSummary(true);
      });

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
        assertRequestActive();

        // 🚀 PERFORMANCE: comparação temporal também entra em transição para priorizar interações de UI.
        startTransition(() => {
          setComparisonSessions({
            yesterdayDay,
            weekAgoDay,
            monthAgoDay,
            yesterdayWeek,
            weekAgoWeek,
            monthAgoWeek,
          });
          setComparisonError(null);
        });
      } catch {
        assertRequestActive();
        startTransition(() => {
          setComparisonSessions(null);
          setComparisonError("Nao foi possivel carregar a comparacao temporal.");
        });
      }
    } catch (error) {
      if (isPanelRequestAbortedError(error)) {
        return;
      }
      setSummaryError(
        error instanceof Error ? error.message : "Falha ao carregar resumo do painel.",
      );
    } finally {
      if (requestId === loadSummaryRequestIdRef.current && isMountedRef.current) {
        setLoadingSummary(false);
      }
    }
  }, [accessToken, sortSessionsOnRuntime]);

  useEffect(() => {
    if (!hasLoadedSummary) {
      void loadSummary();
    }
  }, [hasLoadedSummary, loadSummary]);

  useEffect(() => {
    if (accessToken === null) {
      return;
    }
    const intervalId = setInterval(() => {
      void loadSummary();
    }, 45000);
    return () => {
      clearInterval(intervalId);
    };
  }, [accessToken, loadSummary]);

  useEffect(() => {
    if (
      latestNotification === null ||
      latestNotification.eventType === null ||
      latestNotification.eventType === undefined
    ) {
      return;
    }
    if (!REALTIME_REFRESH_EVENTS.has(latestNotification.eventType)) {
      return;
    }
    if (lastHandledRealtimeNotificationIdRef.current === latestNotification.id) {
      return;
    }

    lastHandledRealtimeNotificationIdRef.current = latestNotification.id;
    void loadSummary();
  }, [latestNotification, loadSummary]);

  useEffect(() => {
    sessionPanelCache = {
      todaySessions,
      weekSessions,
      comparisonSessions,
      activityItems,
      sessionPriceCents,
      hasLoadedSummary,
    };
  }, [
    activityItems,
    comparisonSessions,
    hasLoadedSummary,
    sessionPriceCents,
    todaySessions,
    weekSessions,
  ]);

  // 🚀 PERFORMANCE: consolida métricas de sessões em uma única passada para reduzir trabalho por render.
  const sessionSummarySnapshot = useMemo(() => {
    let todayCount = 0;
    let todayPending = 0;

    for (const session of todaySessions) {
      if (session.status === "canceled") {
        continue;
      }
      todayCount += 1;
      if (session.status === "scheduled" || session.status === "rescheduled") {
        todayPending += 1;
      }
    }

    let recurringActivities = 0;
    for (const activity of activityItems) {
      if (activity.recurrenceRule !== "none") {
        recurringActivities += 1;
      }
    }

    let billableWeekSessions = 0;
    for (const session of weekSessions) {
      if (session.status !== "canceled") {
        billableWeekSessions += 1;
      }
    }

    return {
      todayCount,
      todayPending,
      recurringActivities,
      billableWeekSessions,
    };
  }, [activityItems, todaySessions, weekSessions]);

  const recurringActivities = sessionSummarySnapshot.recurringActivities;
  const billableWeekSessions = sessionSummarySnapshot.billableWeekSessions;
  const estimatedWeekRevenue =
    sessionPriceCents === null ? null : sessionSummarySnapshot.billableWeekSessions * sessionPriceCents;

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

  const sessionsTodayDefinition = useMemo<DashboardKpiCardDefinition>(
    () => ({
      id: "sessionsToday",
      title: "Sessoes de hoje",
      format: "count",
      value: hasLoadedSummary ? sessionSummarySnapshot.todayCount : null,
      comparisonValues: sessionsComparisonValues,
      nounSingular: "sessao",
      nounPlural: "sessoes",
      emptyValueText: loadingSummary ? "..." : "--",
      noCurrentDataText: "Sem dados de sessoes para comparar.",
    }),
    [hasLoadedSummary, loadingSummary, sessionSummarySnapshot.todayCount, sessionsComparisonValues],
  );

  const pendingDefinition = useMemo<DashboardKpiCardDefinition>(
    () => ({
      id: "pendingConfirmations",
      title: "Pendentes de confirmacao",
      format: "count",
      value: hasLoadedSummary ? sessionSummarySnapshot.todayPending : null,
      comparisonValues: pendingComparisonValues,
      nounSingular: "pendencia",
      nounPlural: "pendencias",
      emptyValueText: loadingSummary ? "..." : "--",
      noCurrentDataText: "Sem pendencias suficientes para comparar.",
    }),
    [hasLoadedSummary, loadingSummary, pendingComparisonValues, sessionSummarySnapshot.todayPending],
  );

  const weeklyRevenueDefinition = useMemo<DashboardKpiCardDefinition>(
    () => ({
      id: "weeklyRevenue",
      title: "Receita semanal prevista",
      format: "currency",
      value: hasLoadedSummary ? estimatedWeekRevenue : null,
      comparisonValues: revenueComparisonValues,
      emptyValueText:
        loadingSummary || summaryError !== null ? "..." : "Defina o valor da sessao na configuracao.",
      noCurrentDataText: "Sem base de receita para comparacao.",
    }),
    [
      estimatedWeekRevenue,
      hasLoadedSummary,
      loadingSummary,
      revenueComparisonValues,
      summaryError,
    ],
  );

  const todayDateKey = useMemo(() => toDateKeyFromDate(new Date()), []);

  const selectedDaySessions = useMemo(
    () =>
      weekSessions
        .filter((session) => toDateKeyFromIso(session.scheduledStartAt) === selectedPanelDateKey)
        .sort((left, right) => left.scheduledStartAt.localeCompare(right.scheduledStartAt)),
    [selectedPanelDateKey, weekSessions],
  );

  const selectedAgendaSession = useMemo(
    () =>
      agendaSessionModalId === null
        ? null
        : weekSessions.find((session) => session.id === agendaSessionModalId) ?? null,
    [agendaSessionModalId, weekSessions],
  );
  const selectedAgendaSessionStatus = useMemo(
    () =>
      selectedAgendaSession === null ? null : sessionStatusStyle(selectedAgendaSession.status),
    [selectedAgendaSession],
  );

  useEffect(() => {
    if (agendaSessionModalId !== null && selectedAgendaSession === null) {
      setAgendaSessionModalId(null);
    }
  }, [agendaSessionModalId, selectedAgendaSession]);

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

  const kpiDeckHeight = useMemo(() => {
    if (viewportWidth <= 360) {
      return 132;
    }
    if (viewportWidth <= 390) {
      return 122;
    }
    return 112;
  }, [viewportWidth]);

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
              cardStyle={[styles.topKpiCard, { minHeight: kpiDeckHeight }]}
            />
          </View>
          <View style={styles.topKpiColumn}>
            <KpiStackDeck
              primaryDefinition={pendingDefinition}
              secondaryDefinition={weeklyRevenueDefinition}
              primaryPreferences={cardPreferences.pendingConfirmations}
              secondaryPreferences={cardPreferences.weeklyRevenue}
              deckHeight={kpiDeckHeight}
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
          ) : (
            <>
              <PanelAgendaDayPreview
                selectedDateKey={selectedPanelDateKey}
                todayDateKey={todayDateKey}
                weekSessions={weekSessions}
                onSelectDate={setSelectedPanelDateKey}
                onPressSession={(session) => setAgendaSessionModalId(session.id)}
              />
              {selectedDaySessions.length === 0 ? (
                <Text style={styles.emptyText}>Sem atendimentos programados para este dia.</Text>
              ) : null}
            </>
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
        visible={selectedAgendaSession !== null}
        animationType="fade"
        onRequestClose={() => setAgendaSessionModalId(null)}
      >
        <View style={styles.agendaModalOverlay}>
          <Pressable style={styles.modalBackdropTapZone} onPress={() => setAgendaSessionModalId(null)} />
          {selectedAgendaSession !== null ? (
            <View style={styles.agendaModalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Agendamento do dia</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Fechar agendamento"
                  onPress={() => setAgendaSessionModalId(null)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close-outline" size={18} color="#344054" />
                </Pressable>
              </View>

              <View style={styles.agendaModalBody}>
                <Text style={styles.agendaModalPatientName}>{selectedAgendaSession.patientName}</Text>
                <Text style={styles.agendaModalTime}>
                  {toDateLabel(selectedAgendaSession.scheduledStartAt)} -{" "}
                  {toDateLabel(selectedAgendaSession.scheduledEndAt)}
                </Text>
                <View
                  style={[
                    styles.agendaModalStatusBadge,
                    { backgroundColor: selectedAgendaSessionStatus?.background ?? "#EAECF0" },
                  ]}
                >
                  <Text
                    style={[
                      styles.agendaModalStatusText,
                      { color: selectedAgendaSessionStatus?.color ?? "#475467" },
                    ]}
                  >
                    {selectedAgendaSessionStatus?.label ?? "Agendamento"}
                  </Text>
                </View>
              </View>

              <View style={styles.agendaModalActions}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.agendaModalPrimaryAction}
                  onPress={() => {
                    setAgendaSessionModalId(null);
                    router.push(psychologistRoutes.agenda);
                  }}
                >
                  <Text style={styles.agendaModalPrimaryActionText}>Abrir agenda completa</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.agendaModalSecondaryAction}
                  onPress={() => setAgendaSessionModalId(null)}
                >
                  <Text style={styles.agendaModalSecondaryActionText}>Fechar</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

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
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 12,
  },
  topKpiColumn: {
    flex: 1,
    minWidth: 0,
  },
  topKpiCard: {
    minHeight: 112,
  },
  kpiDeckWrap: {
    borderRadius: 18,
    overflow: "hidden",
  },
  kpiDeckCarouselContent: {
    alignItems: "stretch",
  },
  kpiDeckSlide: {
    width: "100%",
  },
  kpiDeckCard: {
    minHeight: 112,
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
    minHeight: 32,
    justifyContent: "center",
  },
  kpiTrendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  kpiComparisonText: {
    flex: 1,
    flexShrink: 1,
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
  agendaModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.28)",
  },
  modalBackdropTapZone: {
    ...StyleSheet.absoluteFillObject,
  },
  agendaModalCard: {
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
  agendaModalBody: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EAECF0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 6,
  },
  agendaModalPatientName: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  agendaModalTime: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  agendaModalStatusBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    minHeight: 26,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  agendaModalStatusText: {
    fontFamily: typographyContract.fontFamily,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  agendaModalActions: {
    flexDirection: "row",
    gap: 8,
  },
  agendaModalPrimaryAction: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#175CD3",
    backgroundColor: "#175CD3",
    alignItems: "center",
    justifyContent: "center",
  },
  agendaModalPrimaryActionText: {
    fontFamily: typographyContract.fontFamily,
    color: "#FFFFFF",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "700",
  },
  agendaModalSecondaryAction: {
    minWidth: 86,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  agendaModalSecondaryActionText: {
    fontFamily: typographyContract.fontFamily,
    color: "#344054",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
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
