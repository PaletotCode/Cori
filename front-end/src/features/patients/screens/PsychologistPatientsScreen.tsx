import AsyncStorage from "@react-native-async-storage/async-storage";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useNavigation } from "expo-router";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Animated,
  InteractionManager,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { typographyContract } from "../../../shared/ui/typography";
import {
  createDefaultKpiDeckPreferences,
  type KpiDeckCardDefinition,
} from "../../../shared/ui/KpiStackDeck";
import {
  createActivitiesApiClient,
  type ActivitiesApiClient,
} from "../../activities/api/activitiesApiClient";
import type { ActivityItem } from "../../activities/api/types";
import { useAuthStore } from "../../auth/hooks/useAuthStore";
import { authStore } from "../../auth/store/authStore";
import { createFormsApiClient, type FormsApiClient } from "../../forms/api/formsApiClient";
import type { ClinicalFormListItem } from "../../forms/api/types";
import {
  createNotificationsApiClient,
  type NotificationsApiClient,
} from "../../notifications/api/notificationsApiClient";
import type {
  NotificationCategory,
  NotificationDelivery,
  NotificationPreferences,
  UnifiedTimelineEvent,
} from "../../notifications/api/types";
import {
  createSessionsApiClient,
  type SessionsApiClient,
} from "../../sessions/api/sessionsApiClient";
import type { SessionAgendaItem } from "../../sessions/api/types";
import { buildWhatsappShortcut } from "../domain/whatsappShortcut";
import { createPatientsApiClient, type PatientsApiClient } from "../api/patientsApiClient";
import type {
  PatientDetail,
  PatientListItem,
  PatientOverviewKpis,
  PatientTimelineEvent,
} from "../api/types";
import { PatientDetailHeroBanner } from "../components/detail/PatientDetailHeroBanner";
import { PatientOverviewKpiCarousel } from "../components/detail/PatientOverviewKpiCarousel";
import { PatientTimelineFilterChips } from "../components/detail/PatientTimelineFilterChips";
import {
  PatientWorkspaceFeed,
  type PatientWorkspaceFeedItem,
} from "../components/detail/PatientWorkspaceFeed";
import { PatientCard } from "../components/PatientCard";
import {
  PatientTimelineFeed,
  type PatientTimelineFeedItem,
} from "../components/PatientTimelineFeed";

const patientsApiClient = createPatientsApiClient();
const notificationsApiClient = createNotificationsApiClient();
const activitiesApiClient = createActivitiesApiClient();
const formsApiClient = createFormsApiClient();
const sessionsApiClient = createSessionsApiClient();
const PATIENTS_PULL_HINT_SEEN_STORAGE_KEY = "patients.pull_hint_seen.v1";

type PatientsStep = "list" | "detail";
type IoniconName = ComponentProps<typeof Ionicons>["name"];
type PatientOverviewCardId =
  | "completed_sessions"
  | "upcoming_sessions"
  | "assigned_activities"
  | "patient_journey_days";
type TimelineCategoryFilter =
  | NotificationCategory
  | "profile"
  | "changes"
  | "payments";

interface CombinedTimelineItem extends PatientTimelineFeedItem {
  category: TimelineCategoryFilter;
}

interface PatientChangePreview {
  id: string;
  summary: string;
  createdAt: string;
}

interface PsychologistPatientsScreenProps {
  apiClient?: PatientsApiClient;
  notificationsClient?: NotificationsApiClient;
  activitiesClient?: ActivitiesApiClient;
  formsClient?: FormsApiClient;
  sessionsClient?: SessionsApiClient;
}

const TIMELINE_CATEGORY_FILTERS: TimelineCategoryFilter[] = [
  "sessions",
  "activities",
  "forms",
  "documents",
  "notifications",
  "app_usage",
  "profile",
  "changes",
  "payments",
];

const TIMELINE_CATEGORY_LABEL: Record<TimelineCategoryFilter, string> = {
  sessions: "Sessoes",
  activities: "Atividades",
  forms: "Formularios",
  documents: "Documentos",
  notifications: "Notificacoes",
  app_usage: "ABP",
  profile: "Cadastro",
  changes: "Mudancas",
  payments: "Pagamentos",
};

const TIMELINE_ACCENT_COLOR: Record<TimelineCategoryFilter, string> = {
  sessions: "#0284C7",
  activities: "#7C3AED",
  forms: "#4F46E5",
  documents: "#0EA5E9",
  notifications: "#EA580C",
  app_usage: "#0891B2",
  profile: "#0F766E",
  changes: "#B45309",
  payments: "#16A34A",
};

const TIMELINE_CATEGORY_ICON: Record<TimelineCategoryFilter, IoniconName> = {
  sessions: "calendar-outline",
  activities: "pulse-outline",
  forms: "document-text-outline",
  documents: "document-attach-outline",
  notifications: "notifications-outline",
  app_usage: "phone-portrait-outline",
  profile: "person-outline",
  changes: "swap-horizontal-outline",
  payments: "card-outline",
};

interface PatientsScreenCache {
  patients: PatientListItem[];
  patientDetailsById: Record<string, PatientDetail>;
  hasLoadedList: boolean;
}

interface PatientCardListItem {
  patient: PatientListItem;
  summary: string;
  ageLabel: string;
  birthdayLabel: string;
  whatsappDisabled: boolean;
  callDisabled: boolean;
}

interface WorkspaceCollections {
  activities: ActivityItem[];
  forms: ClinicalFormListItem[];
}

const REQUEST_ABORTED_ERROR_NAME = "PatientsScreenRequestAborted";
const SESSIONS_FETCH_BATCH_SIZE = 4;
const PATIENTS_PAGE_SIZE = 40;
const TIMELINE_PAGE_SIZE = 3;
const WORKSPACE_PAGE_SIZE = 3;
const DETAIL_WORKSPACE_LOAD_DEFER_MS =
  process.env.PATIENTS_PERF_SIM === "1"
    ? 230
    : process.env.NODE_ENV === "test"
      ? 0
      : 230;

const OVERVIEW_DECK_PREFERENCES = createDefaultKpiDeckPreferences<PatientOverviewCardId>([
  "completed_sessions",
  "upcoming_sessions",
  "assigned_activities",
  "patient_journey_days",
]);

let patientsScreenCache: PatientsScreenCache | null = null;

export function __resetPatientsScreenCacheForTests(): void {
  patientsScreenCache = null;
}

function createRequestAbortedError(): Error {
  const error = new Error("Solicitacao interrompida.");
  error.name = REQUEST_ABORTED_ERROR_NAME;
  return error;
}

function isRequestAbortedError(error: unknown): boolean {
  return error instanceof Error && error.name === REQUEST_ABORTED_ERROR_NAME;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseBirthDate(value: string | null): Date | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);

  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function calculateAge(birthDateIso: string | null): number | null {
  const birthDate = parseBirthDate(birthDateIso);
  if (birthDate === null) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function daysUntilNextBirthday(birthDateIso: string | null): number | null {
  const birthDate = parseBirthDate(birthDateIso);
  if (birthDate === null) {
    return null;
  }

  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let nextBirthday = new Date(
    today.getFullYear(),
    birthDate.getMonth(),
    birthDate.getDate(),
  );

  if (nextBirthday.getTime() < startToday.getTime()) {
    nextBirthday = new Date(
      today.getFullYear() + 1,
      birthDate.getMonth(),
      birthDate.getDate(),
    );
  }

  const diffMs = nextBirthday.getTime() - startToday.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

function formatDateTimePtBr(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Data indisponivel";
  }
  return parsed.toLocaleString("pt-BR");
}

function formatTimelineEventLabel(rawLabel: string): string {
  const normalized = rawLabel.replace(/[_-]+/g, " ").trim();
  if (normalized.length === 0) {
    return "Atualizacao";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function summarizePayload(payload: Record<string, unknown>): string {
  const entries = Object.entries(payload).slice(0, 2);
  if (entries.length === 0) {
    return "Atualizacao registrada na timeline do paciente.";
  }
  const summary = entries
    .map(([key, value]) => `${formatTimelineEventLabel(key)}: ${String(value)}`)
    .join(" | ");
  return `Detalhes: ${summary}`;
}

function pickNaturalText(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : fallback;
}

function firstValidDate(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) {
      continue;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return value;
    }
  }
  return null;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveSummary(patient: PatientListItem, detail: PatientDetail | null): string {
  if (detail?.communicationNotes && detail.communicationNotes.trim().length > 0) {
    return detail.communicationNotes.trim();
  }
  if (patient.preferredName && patient.preferredName.trim().length > 0) {
    return `Prefere ser chamado(a) de ${patient.preferredName.trim()}.`;
  }
  if (detail?.pronouns && detail.pronouns.trim().length > 0) {
    return `Pronomes: ${detail.pronouns.trim()}.`;
  }
  if (patient.email && patient.email.trim().length > 0) {
    return `Contato principal por email (${patient.email.trim()}).`;
  }
  if (patient.phone && patient.phone.trim().length > 0) {
    return `Contato principal por telefone (${patient.phone.trim()}).`;
  }
  return "Perfil em acompanhamento clinico ativo.";
}

function resolveAgeLabel(detail: PatientDetail | null): string {
  const age = calculateAge(detail?.birthDate ?? null);
  return age === null ? "Idade: nao informada" : `Idade: ${age} anos`;
}

function resolveBirthdayCountdownLabel(detail: PatientDetail | null): string {
  const days = daysUntilNextBirthday(detail?.birthDate ?? null);
  if (days === null) {
    return "Proximo aniversario: nao informado";
  }
  return `Proximo aniversario em ${days} dia${days === 1 ? "" : "s"}`;
}

function resolveCardAgeLabel(detail: PatientDetail | null): string {
  const age = calculateAge(detail?.birthDate ?? null);
  return age === null ? "S/idade" : `${age} anos`;
}

function resolveCardBirthdayLabel(detail: PatientDetail | null): string {
  const days = daysUntilNextBirthday(detail?.birthDate ?? null);
  if (days === null) {
    return "S/niver";
  }
  if (days === 0) {
    return "Niver hoje";
  }
  return `Niver ${days}d`;
}

function resolvePatientSearchBlob(patient: PatientListItem, detail: PatientDetail | null): string {
  const age = calculateAge(detail?.birthDate ?? null);
  const fields = [
    patient.fullName,
    patient.preferredName ?? "",
    patient.email ?? "",
    patient.phone ?? "",
    patient.profileSource,
    patient.preferredContactChannel,
    detail?.communicationNotes ?? "",
    detail?.pronouns ?? "",
    detail?.birthDate ?? "",
    age === null ? "" : String(age),
    resolveBirthdayCountdownLabel(detail),
  ];

  return normalizeSearch(fields.join(" "));
}

function sanitizePhoneForDial(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function resolvePhoneActionLabel(phone: string | null): string {
  const normalized = phone?.trim() ?? "";
  return normalized.length >= 8 ? normalized : "";
}

function resolveOverviewComparisonValues(
  card:
    | PatientOverviewKpis["cards"][number]
    | null,
): Record<"yesterday" | "weekAgo" | "monthAgo", number | null> {
  if (card === null) {
    return {
      yesterday: null,
      weekAgo: null,
      monthAgo: null,
    };
  }

  const byItem = new Map(
    card.comparisons.map((comparison) => [comparison.item, comparison.baselineValue] as const),
  );
  return {
    yesterday: byItem.get("yesterday") ?? null,
    weekAgo: byItem.get("weekAgo") ?? null,
    monthAgo: byItem.get("monthAgo") ?? null,
  };
}

function isTokenInvalidMessage(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const normalized = error.message.toLowerCase();
  return (
    normalized.includes("token invalido") ||
    normalized.includes("token inválido") ||
    normalized.includes("unauthorized")
  );
}

function classifyUnifiedEventCategory(event: UnifiedTimelineEvent): TimelineCategoryFilter {
  const normalizedType = event.eventType.toLowerCase();
  if (
    normalizedType.includes("payment") ||
    normalizedType.includes("pagamento") ||
    normalizedType.includes("invoice") ||
    normalizedType.includes("billing")
  ) {
    return "payments";
  }
  return event.category;
}

async function loadPatientSessionsFromYearRange(params: {
  accessToken: string;
  patientId: string;
  startYear: number;
  sessionsClient: SessionsApiClient;
  signal?: AbortSignal;
}): Promise<SessionAgendaItem[]> {
  const { accessToken, patientId, sessionsClient, signal, startYear } = params;
  const now = new Date();
  const currentYear = now.getFullYear();
  const normalizedStartYear = Math.max(2000, Math.min(startYear, currentYear));
  const monthDates: Date[] = [];

  for (let year = normalizedStartYear; year <= currentYear; year += 1) {
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      monthDates.push(new Date(year, monthIndex, 1));
    }
  }

  const byId = new Map<string, SessionAgendaItem>();
  for (let startIndex = 0; startIndex < monthDates.length; startIndex += SESSIONS_FETCH_BATCH_SIZE) {
    if (signal?.aborted) {
      throw createRequestAbortedError();
    }

    const batch = monthDates.slice(startIndex, startIndex + SESSIONS_FETCH_BATCH_SIZE);
    // 🚀 PERFORMANCE: limita concorrencia de meses para reduzir rajadas de parse JSON na JS Thread.
    const batchResponses = await Promise.allSettled(
      batch.map((monthDate) =>
        sessionsClient.listAgenda(accessToken, {
          view: "month",
          referenceDate: toDateKey(monthDate),
        }),
      ),
    );

    if (signal?.aborted) {
      throw createRequestAbortedError();
    }

    for (const response of batchResponses) {
      if (response.status !== "fulfilled") {
        continue;
      }
      for (const item of response.value) {
        if (item.patientId !== patientId) {
          continue;
        }
        byId.set(item.id, item);
      }
    }
  }

  return [...byId.values()].sort(
    (left, right) =>
      new Date(right.scheduledStartAt).getTime() - new Date(left.scheduledStartAt).getTime(),
  );
}

function processWorkspaceCollections(
  activities: ActivityItem[],
  forms: ClinicalFormListItem[],
  patientId: string,
): WorkspaceCollections {
  const filteredActivities = activities.filter((item) => item.patientId === patientId);
  filteredActivities.sort(
    (left, right) => new Date(right.assignedAt).getTime() - new Date(left.assignedAt).getTime(),
  );

  const filteredForms = forms.filter((item) => item.patientId === patientId);
  filteredForms.sort((left, right) => {
    const leftAnchor = left.assignedAt ?? left.scheduledSendAt ?? left.publishedAt ?? "";
    const rightAnchor = right.assignedAt ?? right.scheduledSendAt ?? right.publishedAt ?? "";
    return new Date(rightAnchor).getTime() - new Date(leftAnchor).getTime();
  });

  return {
    activities: filteredActivities,
    forms: filteredForms,
  };
}

export function PsychologistPatientsScreen({
  apiClient = patientsApiClient,
  notificationsClient = notificationsApiClient,
  activitiesClient = activitiesApiClient,
  formsClient = formsApiClient,
  sessionsClient = sessionsApiClient,
}: PsychologistPatientsScreenProps) {
  const navigation = useNavigation();
  const { width: viewportWidth } = useWindowDimensions();
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null);

  const [patients, setPatients] = useState<PatientListItem[]>(
    () => patientsScreenCache?.patients ?? [],
  );
  const [patientDetailsById, setPatientDetailsById] = useState<Record<string, PatientDetail>>(
    () => patientsScreenCache?.patientDetailsById ?? {},
  );

  const [searchQuery, setSearchQuery] = useState("");

  const [step, setStep] = useState<PatientsStep>("list");
  const transitionStateRef = useRef<{ step: PatientsStep; value: Animated.Value }>({
    step: "list",
    value: new Animated.Value(0),
  });
  if (transitionStateRef.current.step !== step) {
    transitionStateRef.current = { step, value: new Animated.Value(0) };
  }
  const transition = transitionStateRef.current.value;
  const tabEntryMotion = useRef(new Animated.Value(0)).current;

  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const [selectedPatientDetail, setSelectedPatientDetail] = useState<PatientDetail | null>(null);
  const [selectedPatientChanges, setSelectedPatientChanges] = useState<PatientChangePreview[]>([]);
  const [selectedPatientProfileTimeline, setSelectedPatientProfileTimeline] = useState<PatientTimelineEvent[]>([]);
  const [selectedUnifiedTimeline, setSelectedUnifiedTimeline] = useState<UnifiedTimelineEvent[]>([]);
  const [selectedDeliveries, setSelectedDeliveries] = useState<NotificationDelivery[]>([]);
  const [, setSelectedNotificationPreferences] =
    useState<NotificationPreferences | null>(null);
  const [selectedActivities, setSelectedActivities] = useState<ActivityItem[]>([]);
  const [selectedForms, setSelectedForms] = useState<ClinicalFormListItem[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<SessionAgendaItem[]>([]);
  const [selectedOverviewKpis, setSelectedOverviewKpis] = useState<PatientOverviewKpis | null>(null);

  const [listLoading, setListLoading] = useState(false);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [listHydrating, setListHydrating] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hasLoadedList, setHasLoadedList] = useState(
    () => patientsScreenCache?.hasLoadedList ?? false,
  );
  const [hasMorePatients, setHasMorePatients] = useState(
    () => (patientsScreenCache?.patients.length ?? 0) >= PATIENTS_PAGE_SIZE,
  );
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [showPullHint, setShowPullHint] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const [avatarModalVisible, setAvatarModalVisible] = useState(false);

  const [timelineFilters, setTimelineFilters] = useState<Record<TimelineCategoryFilter, boolean>>({
    sessions: true,
    activities: true,
    forms: true,
    documents: true,
    notifications: true,
    app_usage: true,
    profile: true,
    changes: true,
    payments: true,
  });
  const [timelinePage, setTimelinePage] = useState(1);
  const [workspacePage, setWorkspacePage] = useState(1);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const listLoadRequestIdRef = useRef(0);
  const listLoadMoreRequestIdRef = useRef(0);
  const detailsHydrationRequestIdRef = useRef(0);
  const detailLoadRequestIdRef = useRef(0);
  const hasLoadedListRef = useRef(hasLoadedList);
  const isMountedRef = useRef(true);
  const stepRef = useRef<PatientsStep>(step);
  const listAbortControllerRef = useRef<AbortController | null>(null);
  const detailAbortControllerRef = useRef<AbortController | null>(null);
  const detailInteractionRef = useRef<{ cancel: () => void } | null>(null);
  const detailCleanupInteractionRef = useRef<{ cancel: () => void } | null>(null);
  const detailLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runWithTokenRetry = useCallback(
    async <TResult,>(
      operation: (token: string) => Promise<TResult>,
      signal?: AbortSignal,
    ): Promise<TResult> => {
      if (signal?.aborted) {
        throw createRequestAbortedError();
      }
      if (accessToken === null) {
        throw new Error("Sessao expirada. Entre novamente.");
      }

      try {
        const result = await operation(accessToken);
        if (signal?.aborted) {
          throw createRequestAbortedError();
        }
        return result;
      } catch (requestError) {
        if (isRequestAbortedError(requestError)) {
          throw requestError;
        }
        if (!isTokenInvalidMessage(requestError)) {
          throw requestError;
        }

        try {
          await authStore.actions.refreshSession();
        } catch {
          await authStore.actions.logout();
          throw new Error("Sessao expirada. Entre novamente para carregar pacientes.");
        }
        const refreshedToken = authStore.getState().tokens?.accessToken ?? null;
        if (refreshedToken === null) {
          throw new Error("Sessao expirada. Entre novamente para carregar pacientes.");
        }
        const retriedResult = await operation(refreshedToken);
        if (signal?.aborted) {
          throw createRequestAbortedError();
        }
        return retriedResult;
      }
    },
    [accessToken],
  );

  useEffect(() => {
    hasLoadedListRef.current = hasLoadedList;
  }, [hasLoadedList]);

  useEffect(() => {
    // 🚀 PERFORMANCE: reinicia a paginação local da timeline para evitar renderização massiva ao trocar paciente/filtros.
    setTimelinePage(1);
  }, [selectedPatientId, timelineFilters]);

  useEffect(() => {
    setWorkspacePage(1);
  }, [selectedPatientId]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useFocusEffect(
    useCallback(() => {
      // 🚀 PERFORMANCE: reaplica a entrada suave ao focar via troca de abas (ex.: Painel -> Pacientes).
      tabEntryMotion.setValue(0);
      const animation = Animated.timing(tabEntryMotion, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      });
      animation.start();

      return () => {
        animation.stop();
        tabEntryMotion.setValue(0);
      };
    }, [tabEntryMotion]),
  );

  useEffect(() => {
    // 🚀 PERFORMANCE: replica a transição da Agenda no conteúdo alvo após trocar de passo.
    let canceled = false;
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;
    let animation: Animated.CompositeAnimation | null = null;

    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (canceled) {
          return;
        }
        animation = Animated.timing(transition, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        });
        animation.start();
      });
    });

    return () => {
      canceled = true;
      if (firstFrame !== null) {
        cancelAnimationFrame(firstFrame);
      }
      if (secondFrame !== null) {
        cancelAnimationFrame(secondFrame);
      }
      animation?.stop();
    };
  }, [step, transition]);

  useEffect(() => {
    // 🚀 PERFORMANCE: cleanup centralizado cancela cargas e timeouts pendentes no unmount.
    return () => {
      isMountedRef.current = false;
      listAbortControllerRef.current?.abort();
      detailAbortControllerRef.current?.abort();
      detailInteractionRef.current?.cancel();
      detailCleanupInteractionRef.current?.cancel();
      if (detailLoadTimeoutRef.current !== null) {
        clearTimeout(detailLoadTimeoutRef.current);
        detailLoadTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const hydratePullHint = async () => {
      try {
        const raw = await AsyncStorage.getItem(PATIENTS_PULL_HINT_SEEN_STORAGE_KEY);
        if (controller.signal.aborted) {
          return;
        }
        if (raw === "1") {
          setShowPullHint(false);
          return;
        }
        setShowPullHint(true);
        await AsyncStorage.setItem(PATIENTS_PULL_HINT_SEEN_STORAGE_KEY, "1");
      } catch {
        if (!controller.signal.aborted) {
          setShowPullHint(true);
        }
      }
    };

    void hydratePullHint();

    return () => {
      controller.abort();
    };
  }, []);

  const processWorkspaceCollectionsOnRuntime = useCallback(
    async (activities: ActivityItem[], forms: ClinicalFormListItem[], patientId: string) => {
      // 🚀 PERFORMANCE: pré-processamento pesado é adiado para o próximo tick, evitando disputar o mesmo frame da navegação.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      return processWorkspaceCollections(activities, forms, patientId);
    },
    [],
  );

  const hydratePatientCardDetails = useCallback(
    async (items: PatientListItem[], signal?: AbortSignal) => {
      if (items.length === 0 || signal?.aborted || !isMountedRef.current) {
        return;
      }

      const requestId = ++detailsHydrationRequestIdRef.current;
      setListHydrating(true);

      try {
        const responses = await Promise.allSettled(
          items.map(async (patient) =>
            runWithTokenRetry((token) => apiClient.get(token, patient.id), signal),
          ),
        );

        if (
          signal?.aborted ||
          requestId !== detailsHydrationRequestIdRef.current ||
          !isMountedRef.current
        ) {
          return;
        }

        const nextDetails: Record<string, PatientDetail> = {};
        for (const response of responses) {
          if (response.status !== "fulfilled") {
            continue;
          }
          nextDetails[response.value.id] = response.value;
        }

        // 🚀 PERFORMANCE: atualização de enriquecimento não urgente em transição concorrente.
        startTransition(() => {
          setPatientDetailsById((current) => ({
            ...current,
            ...nextDetails,
          }));
        });
      } finally {
        if (
          requestId === detailsHydrationRequestIdRef.current &&
          !signal?.aborted &&
          isMountedRef.current
        ) {
          setListHydrating(false);
        }
      }
    },
    [apiClient, runWithTokenRetry],
  );

  const loadPatients = useCallback(async () => {
    if (accessToken === null) {
      return;
    }

    const requestId = ++listLoadRequestIdRef.current;
    listAbortControllerRef.current?.abort();
    const controller = new AbortController();
    listAbortControllerRef.current = controller;

    setListLoading(!hasLoadedListRef.current);
    setListLoadingMore(false);
    setError(null);
    try {
      const list = await runWithTokenRetry(
        (token) =>
          apiClient.list(token, {
            sortBy: "full_name",
            sortOrder: "asc",
            limit: PATIENTS_PAGE_SIZE,
            offset: 0,
          }),
        controller.signal,
      );

      if (controller.signal.aborted || !isMountedRef.current || requestId !== listLoadRequestIdRef.current) {
        throw createRequestAbortedError();
      }

      // 🚀 PERFORMANCE: lista principal atualizada como tarefa não urgente para manter responsividade do toque/scroll.
      startTransition(() => {
        setPatients(list);
        setHasLoadedList(true);
        setHasMorePatients(list.length === PATIENTS_PAGE_SIZE);
      });
      void hydratePatientCardDetails(list, controller.signal);
    } catch (requestError) {
      if (isRequestAbortedError(requestError)) {
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao carregar lista de pacientes.",
      );
    } finally {
      if (requestId === listLoadRequestIdRef.current && isMountedRef.current) {
        setListLoading(false);
      }
    }
  }, [accessToken, apiClient, hydratePatientCardDetails, runWithTokenRetry]);

  const loadMorePatients = useCallback(async () => {
    if (accessToken === null || listLoading || listLoadingMore || !hasMorePatients) {
      return;
    }

    const requestId = ++listLoadMoreRequestIdRef.current;
    setListLoadingMore(true);
    setError(null);

    try {
      const page = await runWithTokenRetry((token) =>
        apiClient.list(token, {
          sortBy: "full_name",
          sortOrder: "asc",
          limit: PATIENTS_PAGE_SIZE,
          offset: patients.length,
        }),
      );

      if (requestId !== listLoadMoreRequestIdRef.current || !isMountedRef.current) {
        return;
      }

      setHasMorePatients(page.length === PATIENTS_PAGE_SIZE);
      if (page.length === 0) {
        return;
      }

      startTransition(() => {
        setPatients((current) => {
          const existingIds = new Set(current.map((item) => item.id));
          const freshItems = page.filter((item) => !existingIds.has(item.id));
          if (freshItems.length === 0) {
            return current;
          }
          return [...current, ...freshItems];
        });
      });
      void hydratePatientCardDetails(page);
    } catch (requestError) {
      if (isRequestAbortedError(requestError)) {
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao carregar mais pacientes.",
      );
    } finally {
      if (requestId === listLoadMoreRequestIdRef.current && isMountedRef.current) {
        setListLoadingMore(false);
      }
    }
  }, [
    accessToken,
    apiClient,
    hasMorePatients,
    hydratePatientCardDetails,
    listLoading,
    listLoadingMore,
    patients.length,
    runWithTokenRetry,
  ]);

  const loadSelectedPatientWorkspace = useCallback(
    async (patientId: string) => {
      if (accessToken === null) {
        return;
      }

      const requestId = ++detailLoadRequestIdRef.current;
      detailAbortControllerRef.current?.abort();
      const controller = new AbortController();
      detailAbortControllerRef.current = controller;

      setDetailLoading(true);
      setError(null);
      setInfo(null);

      const timelineCategories: NotificationCategory[] = [
        "sessions",
        "activities",
        "forms",
        "documents",
        "notifications",
        "app_usage",
      ];

      const assertRequestActive = () => {
        if (
          controller.signal.aborted ||
          requestId !== detailLoadRequestIdRef.current ||
          !isMountedRef.current
        ) {
          throw createRequestAbortedError();
        }
      };

      try {
        const detail = await runWithTokenRetry(
          (token) => apiClient.get(token, patientId),
          controller.signal,
        );
        assertRequestActive();

        // 🚀 PERFORMANCE: hidrata perfil basico primeiro e adia cargas secundarias para evitar travar na transicao de tela.
        startTransition(() => {
          setSelectedPatientDetail(detail);
          setPatientDetailsById((current) => ({
            ...current,
            [detail.id]: detail,
          }));
          setSelectedPatientChanges([]);
          setSelectedPatientProfileTimeline([]);
          setSelectedUnifiedTimeline([]);
          setSelectedDeliveries([]);
          setSelectedNotificationPreferences(null);
          setSelectedActivities([]);
          setSelectedForms([]);
          setSelectedSessions([]);
          setSelectedOverviewKpis(null);
        });

        const overviewKpisPromise =
          apiClient.getOverviewKpis !== undefined
            ? runWithTokenRetry(
                (token) =>
                  apiClient.getOverviewKpis!(
                    token,
                    patientId,
                    Intl.DateTimeFormat().resolvedOptions().timeZone,
                  ),
                controller.signal,
              )
            : Promise.resolve<PatientOverviewKpis | null>(null);

        const [
          changesResult,
          profileTimelineResult,
          unifiedTimelineResult,
          deliveriesResult,
          preferencesResult,
          activitiesResult,
          formsResult,
          overviewKpisResult,
        ] = await Promise.allSettled([
          runWithTokenRetry((token) => apiClient.listChanges(token, patientId, 120), controller.signal),
          runWithTokenRetry((token) => apiClient.listTimelineEvents(token, patientId, 160), controller.signal),
          runWithTokenRetry(
            (token) =>
              notificationsClient.listUnifiedTimeline(token, patientId, {
                categories: timelineCategories,
                limit: 300,
              }),
            controller.signal,
          ),
          runWithTokenRetry(
            (token) => notificationsClient.listPatientNotifications(token, patientId, 200),
            controller.signal,
          ),
          runWithTokenRetry(
            (token) => notificationsClient.getPatientPreferences(token, patientId),
            controller.signal,
          ),
          Promise.resolve([] as ActivityItem[]),
          Promise.resolve([] as ClinicalFormListItem[]),
          overviewKpisPromise,
        ]);
        assertRequestActive();

        const nextChanges: PatientChangePreview[] =
          changesResult.status === "fulfilled"
            ? changesResult.value.map((entry) => {
                const when = formatDateTimePtBr(entry.createdAt);
                const fields =
                  entry.changedFields.length > 0
                    ? entry.changedFields.join(", ")
                    : "sem campos detalhados";
                return {
                  id: entry.id,
                  summary: pickNaturalText(
                    entry.naturalSummary,
                    `${entry.changeType} | ${fields} | ${when}`,
                  ),
                  createdAt: entry.createdAt,
                };
              })
            : [];

        const rawActivities = activitiesResult.status === "fulfilled" ? activitiesResult.value : [];
        const rawForms = formsResult.status === "fulfilled" ? formsResult.value : [];
        const nextCollections = await processWorkspaceCollectionsOnRuntime(
          rawActivities,
          rawForms,
          patientId,
        );
        assertRequestActive();

        let sessionsLoadFailed = false;
        let nextSessions: SessionAgendaItem[] = [];
        try {
          const startYear = new Date(detail.createdAt).getFullYear();
          nextSessions = await runWithTokenRetry(
            (token) =>
              loadPatientSessionsFromYearRange({
                accessToken: token,
                patientId,
                startYear: Number.isFinite(startYear) ? startYear : new Date().getFullYear(),
                sessionsClient,
                signal: controller.signal,
              }),
            controller.signal,
          );
        } catch (sessionsError) {
          if (isRequestAbortedError(sessionsError)) {
            throw sessionsError;
          }
          sessionsLoadFailed = true;
          nextSessions = [];
        }
        assertRequestActive();

        const partialFailures = [
          changesResult,
          profileTimelineResult,
          unifiedTimelineResult,
          deliveriesResult,
          preferencesResult,
          activitiesResult,
          formsResult,
          overviewKpisResult,
        ].some((result) => result.status === "rejected");
        const hasAnyPartialFailure = partialFailures || sessionsLoadFailed;

        // 🚀 PERFORMANCE: lote único de setState em transição reduz cascata de re-render no detalhe.
        startTransition(() => {
          setSelectedPatientChanges(nextChanges);
          setSelectedPatientProfileTimeline(
            profileTimelineResult.status === "fulfilled" ? profileTimelineResult.value : [],
          );
          setSelectedUnifiedTimeline(
            unifiedTimelineResult.status === "fulfilled" ? unifiedTimelineResult.value : [],
          );
          setSelectedDeliveries(deliveriesResult.status === "fulfilled" ? deliveriesResult.value : []);
          setSelectedNotificationPreferences(
            preferencesResult.status === "fulfilled" ? preferencesResult.value : null,
          );
          setSelectedActivities(nextCollections.activities);
          setSelectedForms(nextCollections.forms);
          setSelectedSessions(nextSessions);
          setSelectedOverviewKpis(
            overviewKpisResult.status === "fulfilled" ? overviewKpisResult.value : null,
          );
          setInfo(
            hasAnyPartialFailure
              ? "Perfil carregado com dados parciais. Atualize para sincronizar tudo."
              : "Paciente carregado com timeline integrada.",
          );
        });
      } catch (requestError) {
        if (isRequestAbortedError(requestError)) {
          return;
        }
        if (requestId !== detailLoadRequestIdRef.current || !isMountedRef.current) {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Falha ao carregar a visao interna do paciente.",
        );
      } finally {
        if (requestId === detailLoadRequestIdRef.current && isMountedRef.current) {
          setDetailLoading(false);
        }
      }
    },
    [
      accessToken,
      activitiesClient,
      apiClient,
      formsClient,
      notificationsClient,
      processWorkspaceCollectionsOnRuntime,
      runWithTokenRetry,
      sessionsClient,
    ],
  );

  useEffect(() => {
    if (!hasLoadedList) {
      void loadPatients();
    }
  }, [hasLoadedList, loadPatients]);

  useEffect(() => {
    patientsScreenCache = {
      patients,
      patientDetailsById,
      hasLoadedList,
    };
  }, [hasLoadedList, patientDetailsById, patients]);

  const headerSearchWidth = useMemo(() => {
    const relative = Math.round(viewportWidth * 0.45);
    return Math.min(264, Math.max(184, relative));
  }, [viewportWidth]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight:
        step === "list"
          ? () => (
              <View style={[styles.headerSearchWrap, { width: headerSearchWidth }]}>
                <Ionicons name="search-outline" size={14} color="#64748B" />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder={searchFocused ? "" : "Buscar contatos"}
                  placeholderTextColor="#94A3B8"
                  style={styles.headerSearchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  testID="patients-global-search"
                />
              </View>
            )
          : undefined,
    });
  }, [headerSearchWidth, navigation, searchFocused, searchQuery, step]);

  // 🚀 PERFORMANCE: índice de busca pré-processado evita recomputar blob textual completo a cada digitação.
  const patientSearchIndexById = useMemo(() => {
    const next: Record<string, string> = {};
    for (const patient of patients) {
      const details = patientDetailsById[patient.id] ?? null;
      next[patient.id] = resolvePatientSearchBlob(patient, details);
    }
    return next;
  }, [patientDetailsById, patients]);

  const filteredPatients = useMemo(() => {
    const normalized = normalizeSearch(searchQuery);
    if (normalized.length === 0) {
      return patients;
    }

    return patients.filter((patient) => (patientSearchIndexById[patient.id] ?? "").includes(normalized));
  }, [patientSearchIndexById, patients, searchQuery]);

  // 🚀 PERFORMANCE: mapa O(1) reduz buscas lineares repetidas em handlers de contato.
  const patientsById = useMemo(() => {
    const byId = new Map<string, PatientListItem>();
    for (const patient of patients) {
      byId.set(patient.id, patient);
    }
    return byId;
  }, [patients]);

  const detailPatient = selectedPatientDetail ??
    (selectedPatientId ? patientDetailsById[selectedPatientId] ?? null : null);

  const detailInitials = useMemo(() => {
    if (detailPatient === null) {
      return "P";
    }
    const initials = detailPatient.fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((token) => token[0]?.toUpperCase() ?? "")
      .join("");
    return initials.length > 0 ? initials : "P";
  }, [detailPatient]);

  const detailPhone = (detailPatient?.phone ?? "").trim();
  const detailEmail = (detailPatient?.email ?? "").trim();
  const detailWhatsAppDisabled = detailPhone.length < 8 && detailEmail.length === 0;
  const detailPhoneDisabled = detailPhone.length < 8;
  const detailEmergencyDisabled =
    (detailPatient?.emergencyContactPhone?.trim() ?? "").length < 8;
  const detailPhoneActionLabel = resolvePhoneActionLabel(detailPatient?.phone ?? null);

  const completedSessionsCount = useMemo(
    () => selectedSessions.filter((item) => item.status === "completed").length,
    [selectedSessions],
  );

  const upcomingSessionsCount = useMemo(() => {
    const nowMs = Date.now();
    return selectedSessions.filter((item) => {
      const startsAtMs = new Date(item.scheduledStartAt).getTime();
      return (
        startsAtMs >= nowMs &&
        (item.status === "scheduled" || item.status === "confirmed" || item.status === "rescheduled")
      );
    }).length;
  }, [selectedSessions]);

  const assignedActivitiesCount = selectedActivities.length;

  const patientJourneyDays = useMemo(() => {
    const createdAtRaw = detailPatient?.createdAt ?? null;
    if (createdAtRaw === null) {
      return 0;
    }
    const createdAtMs = new Date(createdAtRaw).getTime();
    if (!Number.isFinite(createdAtMs)) {
      return 0;
    }
    const diffMs = Date.now() - createdAtMs;
    if (diffMs < 0) {
      return 0;
    }
    return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  }, [detailPatient?.createdAt]);

  const overviewDeckHeight = useMemo(() => {
    if (viewportWidth <= 360) {
      return 136;
    }
    if (viewportWidth <= 390) {
      return 126;
    }
    return 118;
  }, [viewportWidth]);

  const overviewCardsByKey = useMemo(() => {
    const byKey = new Map<PatientOverviewCardId, PatientOverviewKpis["cards"][number]>();
    for (const card of selectedOverviewKpis?.cards ?? []) {
      if (
        card.key === "completed_sessions" ||
        card.key === "upcoming_sessions" ||
        card.key === "assigned_activities" ||
        card.key === "patient_journey_days"
      ) {
        byKey.set(card.key, card);
      }
    }
    return byKey;
  }, [selectedOverviewKpis]);

  const completedSessionsOverviewDefinition = useMemo<
    KpiDeckCardDefinition<PatientOverviewCardId>
  >(() => {
    const card = overviewCardsByKey.get("completed_sessions") ?? null;
    return {
      id: "completed_sessions",
      title: "Sessoes realizadas",
      format: "count",
      value: card?.currentValue ?? completedSessionsCount,
      comparisonValues: resolveOverviewComparisonValues(card),
      nounSingular: "sessao",
      nounPlural: "sessoes",
      emptyValueText: "0",
      noCurrentDataText: "Sem historico de sessao.",
    };
  }, [completedSessionsCount, overviewCardsByKey]);

  const upcomingSessionsOverviewDefinition = useMemo<
    KpiDeckCardDefinition<PatientOverviewCardId>
  >(() => {
    const card = overviewCardsByKey.get("upcoming_sessions") ?? null;
    return {
      id: "upcoming_sessions",
      title: "Sessoes futuras",
      format: "count",
      value: card?.currentValue ?? upcomingSessionsCount,
      comparisonValues: resolveOverviewComparisonValues(card),
      nounSingular: "sessao",
      nounPlural: "sessoes",
      emptyValueText: "0",
      noCurrentDataText: "Sem agenda futura.",
    };
  }, [overviewCardsByKey, upcomingSessionsCount]);

  const assignedActivitiesOverviewDefinition = useMemo<
    KpiDeckCardDefinition<PatientOverviewCardId>
  >(() => {
    const card = overviewCardsByKey.get("assigned_activities") ?? null;
    return {
      id: "assigned_activities",
      title: "Atividades atribuidas",
      format: "count",
      value: card?.currentValue ?? assignedActivitiesCount,
      comparisonValues: resolveOverviewComparisonValues(card),
      nounSingular: "atividade",
      nounPlural: "atividades",
      emptyValueText: "0",
      noCurrentDataText: "Sem atividades atribuídas.",
    };
  }, [assignedActivitiesCount, overviewCardsByKey]);

  const patientJourneyOverviewDefinition = useMemo<
    KpiDeckCardDefinition<PatientOverviewCardId>
  >(() => {
    const card = overviewCardsByKey.get("patient_journey_days") ?? null;
    return {
      id: "patient_journey_days",
      title: "Tempo de paciente",
      format: "count",
      value: card?.currentValue ?? patientJourneyDays,
      comparisonValues: resolveOverviewComparisonValues(card),
      nounSingular: "dia",
      nounPlural: "dias",
      emptyValueText: "0",
      noCurrentDataText: "Tempo de vínculo indisponível.",
    };
  }, [overviewCardsByKey, patientJourneyDays]);

  const combinedTimeline = useMemo<CombinedTimelineItem[]>(() => {
    const items: CombinedTimelineItem[] = [];

    for (const event of selectedUnifiedTimeline) {
      const category = classifyUnifiedEventCategory(event);
      const fallbackTitle = formatTimelineEventLabel(event.eventType);
      items.push({
        id: `unified-${event.id}`,
        category,
        categoryLabel: pickNaturalText(event.categoryLabel, TIMELINE_CATEGORY_LABEL[category]),
        title: pickNaturalText(event.naturalTitle, fallbackTitle),
        eventLabel: pickNaturalText(
          event.naturalEventLabel,
          `Feito por ${formatTimelineEventLabel(event.actorLabel ?? event.actorType).toLowerCase()}`,
        ),
        detail: pickNaturalText(event.naturalDetail, summarizePayload(event.payload)),
        occurredAt: event.createdAt,
        accentColor: TIMELINE_ACCENT_COLOR[category],
      });
    }

    for (const event of selectedPatientProfileTimeline) {
      const fallbackTitle = formatTimelineEventLabel(event.eventType);
      items.push({
        id: `profile-${event.id}`,
        category: "profile",
        categoryLabel: pickNaturalText(event.categoryLabel, TIMELINE_CATEGORY_LABEL.profile),
        title: pickNaturalText(event.naturalTitle, fallbackTitle),
        eventLabel: pickNaturalText(
          event.naturalEventLabel,
          `Feito por ${formatTimelineEventLabel(event.actorLabel ?? event.actorType).toLowerCase()}`,
        ),
        detail: pickNaturalText(event.naturalDetail, summarizePayload(event.payload)),
        occurredAt: event.createdAt,
        accentColor: TIMELINE_ACCENT_COLOR.profile,
      });
    }

    for (const entry of selectedPatientChanges) {
      items.push({
        id: `changes-${entry.id}`,
        category: "changes",
        categoryLabel: TIMELINE_CATEGORY_LABEL.changes,
        title: "Cadastro atualizado",
        eventLabel: "Historico de alteracoes",
        detail: entry.summary,
        occurredAt: entry.createdAt,
        accentColor: TIMELINE_ACCENT_COLOR.changes,
      });
    }

    for (const delivery of selectedDeliveries) {
      const deliveryOccurredAt =
        firstValidDate(
          delivery.openedAt,
          delivery.deliveredAt,
          delivery.sentAt,
          delivery.failedAt,
          delivery.queuedAt,
          delivery.createdAt,
        ) ?? delivery.createdAt;
      const deliveryBody = typeof delivery.body === "string" ? delivery.body.trim() : "";
      const deliveryReason = delivery.statusReason?.trim() ?? "";
      items.push({
        id: `delivery-${delivery.id}`,
        category: "notifications",
        categoryLabel: pickNaturalText(
          delivery.categoryLabel,
          TIMELINE_CATEGORY_LABEL.notifications,
        ),
        title: pickNaturalText(delivery.naturalTitle, delivery.title),
        eventLabel: pickNaturalText(
          delivery.naturalEventLabel,
          `Status da entrega: ${formatTimelineEventLabel(delivery.status)}`,
        ),
        detail: pickNaturalText(
          delivery.naturalDetail,
          deliveryBody.length > 0
            ? deliveryBody
            : deliveryReason.length > 0
              ? deliveryReason
              : `Evento ${formatTimelineEventLabel(delivery.eventType)} sem corpo detalhado.`,
        ),
        occurredAt: deliveryOccurredAt,
        accentColor: TIMELINE_ACCENT_COLOR.notifications,
      });
    }

    if (selectedUnifiedTimeline.length === 0) {
      // 🚀 PERFORMANCE: fallback local evita timeline vazia quando o endpoint unificado não retorna payload.
      for (const session of selectedSessions) {
        items.push({
          id: `session-fallback-${session.id}`,
          category: "sessions",
          categoryLabel: TIMELINE_CATEGORY_LABEL.sessions,
          title: `Sessao com ${session.patientName}`,
          eventLabel: formatTimelineEventLabel(session.status),
          detail: `Inicio em ${formatDateTimePtBr(session.scheduledStartAt)}.`,
          occurredAt: session.scheduledStartAt,
          accentColor: TIMELINE_ACCENT_COLOR.sessions,
        });
      }

      for (const activity of selectedActivities) {
        items.push({
          id: `activity-fallback-${activity.id}`,
          category: "activities",
          categoryLabel: TIMELINE_CATEGORY_LABEL.activities,
          title: activity.title,
          eventLabel: `Status ${formatTimelineEventLabel(activity.status)}`,
          detail: `Prazo ${formatDateTimePtBr(activity.dueAt)}.`,
          occurredAt: activity.assignedAt,
          accentColor: TIMELINE_ACCENT_COLOR.activities,
        });
      }

      for (const form of selectedForms) {
        const referenceDate =
          form.scheduledSendAt ??
          form.assignedAt ??
          form.publishedAt ??
          form.submittedAt ??
          form.reviewedAt ??
          "1970-01-01T00:00:00.000Z";
        items.push({
          id: `form-fallback-${form.id}`,
          category: "forms",
          categoryLabel: TIMELINE_CATEGORY_LABEL.forms,
          title: form.title,
          eventLabel: `Status ${formatTimelineEventLabel(form.status)}`,
          detail: "Formulario sincronizado no prontuario do paciente.",
          occurredAt: referenceDate,
          accentColor: TIMELINE_ACCENT_COLOR.forms,
        });
      }
    }

    if (items.length === 0 && detailPatient !== null) {
      items.push({
        id: `profile-start-${detailPatient.id}`,
        category: "profile",
        categoryLabel: TIMELINE_CATEGORY_LABEL.profile,
        title: "Cadastro do paciente",
        eventLabel: "Registro inicial",
        detail: "Nenhum evento adicional sincronizado ate agora.",
        occurredAt: detailPatient.createdAt,
        accentColor: TIMELINE_ACCENT_COLOR.profile,
      });
    }

    return items.sort(
      (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
    );
  }, [
    selectedActivities,
    selectedDeliveries,
    detailPatient,
    selectedForms,
    selectedPatientChanges,
    selectedPatientProfileTimeline,
    selectedSessions,
    selectedUnifiedTimeline,
  ]);

  const visibleTimeline = useMemo<PatientTimelineFeedItem[]>(
    () => combinedTimeline.filter((item) => timelineFilters[item.category]),
    [combinedTimeline, timelineFilters],
  );

  const timelineTotalPages = useMemo(
    () => Math.max(1, Math.ceil(visibleTimeline.length / TIMELINE_PAGE_SIZE)),
    [visibleTimeline.length],
  );

  const normalizedTimelinePage = Math.min(timelinePage, timelineTotalPages);

  useEffect(() => {
    if (timelinePage !== normalizedTimelinePage) {
      setTimelinePage(normalizedTimelinePage);
    }
  }, [normalizedTimelinePage, timelinePage]);

  const pagedTimeline = useMemo(
    () => {
      const start = (normalizedTimelinePage - 1) * TIMELINE_PAGE_SIZE;
      return visibleTimeline.slice(start, start + TIMELINE_PAGE_SIZE);
    },
    [normalizedTimelinePage, visibleTimeline],
  );

  const timelineFilterChips = useMemo(
    () =>
      TIMELINE_CATEGORY_FILTERS.map((category) => ({
        key: category,
        label: TIMELINE_CATEGORY_LABEL[category],
        active: timelineFilters[category],
        icon: TIMELINE_CATEGORY_ICON[category],
        tintColor: TIMELINE_ACCENT_COLOR[category],
      })),
    [timelineFilters],
  );

  const workspaceFeedItems = useMemo<PatientWorkspaceFeedItem[]>(() => {
    type CandidateItem = PatientWorkspaceFeedItem & { sortAtMs: number };
    const candidates: CandidateItem[] = [];

    for (const activity of selectedActivities) {
      const dueAtMs = new Date(activity.dueAt).getTime();
      const assignedAtMs = new Date(activity.assignedAt).getTime();
      const sortAtMs = Number.isFinite(dueAtMs)
        ? dueAtMs
        : Number.isFinite(assignedAtMs)
          ? assignedAtMs
          : 0;
      candidates.push({
        id: `activity-${activity.id}`,
        kind: "activity",
        title: activity.title,
        status: activity.status,
        whenLabel: `Prazo ${formatDateTimePtBr(activity.dueAt)}`,
        accentColor: "#7C3AED",
        sortAtMs,
      });
    }

    for (const form of selectedForms) {
      const scheduleMs = form.scheduledSendAt ? new Date(form.scheduledSendAt).getTime() : Number.NaN;
      const assignedMs = form.assignedAt ? new Date(form.assignedAt).getTime() : Number.NaN;
      const publishedMs = form.publishedAt ? new Date(form.publishedAt).getTime() : Number.NaN;
      const sortAtMs = Number.isFinite(scheduleMs)
        ? scheduleMs
        : Number.isFinite(assignedMs)
          ? assignedMs
          : Number.isFinite(publishedMs)
            ? publishedMs
            : 0;
      const whenRaw = form.scheduledSendAt ?? form.assignedAt ?? form.publishedAt ?? null;
      candidates.push({
        id: `form-${form.id}`,
        kind: "form",
        title: form.title,
        status: form.status,
        whenLabel: whenRaw ? `Atualizado ${formatDateTimePtBr(whenRaw)}` : "Sem data registrada",
        accentColor: "#2563EB",
        sortAtMs,
      });
    }

    return candidates
      .sort((left, right) => right.sortAtMs - left.sortAtMs)
      .slice(0, 50)
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        status: item.status,
        whenLabel: item.whenLabel,
        accentColor: item.accentColor,
      }));
  }, [selectedActivities, selectedForms]);

  const workspaceTotalPages = useMemo(
    () => Math.max(1, Math.ceil(workspaceFeedItems.length / WORKSPACE_PAGE_SIZE)),
    [workspaceFeedItems.length],
  );

  const normalizedWorkspacePage = Math.min(workspacePage, workspaceTotalPages);

  useEffect(() => {
    if (workspacePage !== normalizedWorkspacePage) {
      setWorkspacePage(normalizedWorkspacePage);
    }
  }, [normalizedWorkspacePage, workspacePage]);

  const pagedWorkspaceFeedItems = useMemo(() => {
    const start = (normalizedWorkspacePage - 1) * WORKSPACE_PAGE_SIZE;
    return workspaceFeedItems.slice(start, start + WORKSPACE_PAGE_SIZE);
  }, [normalizedWorkspacePage, workspaceFeedItems]);

  const openDetail = useCallback(
    (patientId: string) => {
      detailAbortControllerRef.current?.abort();
      detailInteractionRef.current?.cancel();
      detailCleanupInteractionRef.current?.cancel();
      if (detailLoadTimeoutRef.current !== null) {
        clearTimeout(detailLoadTimeoutRef.current);
        detailLoadTimeoutRef.current = null;
      }
      const cachedDetail = patientDetailsById[patientId] ?? null;
      // 🚀 PERFORMANCE: mantém abertura responsiva; apenas estados visíveis na visão inicial são resetados imediatamente.
      startTransition(() => {
        setSelectedPatientDetail(cachedDetail);
        setSelectedActivities([]);
        setSelectedForms([]);
        setSelectedSessions([]);
        setSelectedOverviewKpis(null);
      });
      setSelectedPatientId(patientId);
      setStep("detail");

      // 🚀 PERFORMANCE: adia hidratação pesada até o final da transição de container transform.
      detailInteractionRef.current = InteractionManager.runAfterInteractions(() => {
        detailLoadTimeoutRef.current = setTimeout(() => {
          detailLoadTimeoutRef.current = null;
          void loadSelectedPatientWorkspace(patientId);
        }, DETAIL_WORKSPACE_LOAD_DEFER_MS);
      });
    },
    [loadSelectedPatientWorkspace, patientDetailsById],
  );

  const backToList = useCallback(() => {
    detailAbortControllerRef.current?.abort();
    detailInteractionRef.current?.cancel();
    detailCleanupInteractionRef.current?.cancel();
    if (detailLoadTimeoutRef.current !== null) {
      clearTimeout(detailLoadTimeoutRef.current);
      detailLoadTimeoutRef.current = null;
    }
    setDetailLoading(false);
    setStep("list");
    setSelectedPatientId(null);
    setInfo(null);
    // 🚀 PERFORMANCE: limpeza pesada do detalhe ocorre após as interações para preservar fluidez no botão "Voltar".
    detailCleanupInteractionRef.current = InteractionManager.runAfterInteractions(() => {
      if (!isMountedRef.current || stepRef.current !== "list") {
        return;
      }
      startTransition(() => {
        setSelectedPatientDetail(null);
        setSelectedPatientChanges([]);
        setSelectedPatientProfileTimeline([]);
        setSelectedUnifiedTimeline([]);
        setSelectedDeliveries([]);
        setSelectedNotificationPreferences(null);
        setSelectedActivities([]);
        setSelectedForms([]);
        setSelectedSessions([]);
        setSelectedOverviewKpis(null);
      });
    });
  }, []);

  const handleOpenWhatsapp = useCallback(
    async (patientId: string) => {
      const patient = patientsById.get(patientId) ?? null;
      const details = patientDetailsById[patientId] ?? null;
      if (patient === null) {
        return;
      }

      try {
        const shortcut = buildWhatsappShortcut({
          phone: details?.phone ?? patient.phone,
          message: `Ola, ${patient.fullName}. Tudo bem?`,
          fallbackMessage: "Ola! Passei aqui para alinhar os proximos passos da terapia.",
        });
        await Linking.openURL(shortcut.url);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Nao foi possivel abrir o WhatsApp para este paciente.",
        );
      }
    },
    [patientDetailsById, patientsById],
  );

  const handleOpenCall = useCallback(
    async (patientId: string) => {
      const patient = patientsById.get(patientId) ?? null;
      const details = patientDetailsById[patientId] ?? null;
      const phoneRaw = details?.phone ?? patient?.phone ?? null;
      if (phoneRaw === null || phoneRaw.trim().length < 8) {
        setError("Paciente sem telefone valido para ligacao.");
        return;
      }

      try {
        const phone = sanitizePhoneForDial(phoneRaw);
        const phoneUrl = `tel:${phone}`;
        const canOpen = await Linking.canOpenURL(phoneUrl);
        if (!canOpen) {
          setError(null);
          setInfo("Ligacao indisponivel neste dispositivo.");
          return;
        }
        await Linking.openURL(phoneUrl);
      } catch (requestError) {
        setError(null);
        setInfo(
          requestError instanceof Error
            ? requestError.message
            : "Nao foi possivel abrir o atalho de ligacao.",
        );
      }
    },
    [patientDetailsById, patientsById],
  );

  const handleOpenEmergencyCall = useCallback(async () => {
    const phoneRaw = detailPatient?.emergencyContactPhone?.trim() ?? "";
    if (phoneRaw.length < 8) {
      setError("Paciente sem telefone de emergencia valido.");
      return;
    }

    try {
      const phone = sanitizePhoneForDial(phoneRaw);
      const phoneUrl = `tel:${phone}`;
      const canOpen = await Linking.canOpenURL(phoneUrl);
      if (!canOpen) {
        setError(null);
        setInfo("Ligacao de emergencia indisponivel neste dispositivo.");
        return;
      }
      await Linking.openURL(phoneUrl);
    } catch (requestError) {
      setError(null);
      setInfo(
        requestError instanceof Error
          ? requestError.message
          : "Nao foi possivel abrir o atalho de emergencia.",
      );
    }
  }, [detailPatient?.emergencyContactPhone]);

  const handleContactActionUnavailable = useCallback((message: string) => {
    setError(null);
    setInfo(message);
  }, []);

  const handleToggleTimelineCategory = useCallback((category: TimelineCategoryFilter) => {
    // 🚀 PERFORMANCE: filtros da timeline entram em transição para priorizar fluidez de toque/scroll.
    startTransition(() => {
      setTimelineFilters((current) => ({
        ...current,
        [category]: !current[category],
      }));
    });
  }, []);

  const handleCheckAllTimelineCategories = useCallback(() => {
    // 🚀 PERFORMANCE: atualização em lote evita re-render por checkbox individual.
    startTransition(() => {
      setTimelineFilters({
        sessions: true,
        activities: true,
        forms: true,
        documents: true,
        notifications: true,
        app_usage: true,
        profile: true,
        changes: true,
        payments: true,
      });
    });
  }, []);

  const handlePullToRefresh = useCallback(async () => {
    setPullRefreshing(true);
    setError(null);
    setInfo(null);
    try {
      if (step === "detail" && selectedPatientId !== null) {
        await loadSelectedPatientWorkspace(selectedPatientId);
        return;
      }
      await loadPatients();
    } finally {
      setPullRefreshing(false);
    }
  }, [loadPatients, loadSelectedPatientWorkspace, selectedPatientId, step]);

  // 🚀 PERFORMANCE: pré-processa dados do card fora do renderItem para evitar lógica por célula durante scroll.
  const patientCardItems = useMemo<PatientCardListItem[]>(
    () =>
      filteredPatients.map((patient) => {
        const detail = patientDetailsById[patient.id] ?? null;
        return {
          patient,
          summary: resolveSummary(patient, detail),
          ageLabel: resolveCardAgeLabel(detail),
          birthdayLabel: resolveCardBirthdayLabel(detail),
          whatsappDisabled:
            (detail?.phone ?? patient.phone ?? "").trim().length < 8 &&
            (detail?.email ?? patient.email ?? "").trim().length === 0,
          callDisabled: (detail?.phone ?? patient.phone ?? "").trim().length < 8,
        };
      }),
    [filteredPatients, patientDetailsById],
  );

  const renderPatientCardItem = useCallback<ListRenderItem<PatientCardListItem>>(
    ({ item }) => (
      <PatientCard
        patient={item.patient}
        summary={item.summary}
        ageLabel={item.ageLabel}
        birthdayLabel={item.birthdayLabel}
        onPressCard={openDetail}
        onPressWhatsApp={handleOpenWhatsapp}
        onPressPhone={handleOpenCall}
        onActionUnavailable={handleContactActionUnavailable}
        whatsappDisabled={item.whatsappDisabled}
        callDisabled={item.callDisabled}
      />
    ),
    [
      handleContactActionUnavailable,
      handleOpenCall,
      handleOpenWhatsapp,
      openDetail,
    ],
  );

  const patientCardKeyExtractor = useCallback((item: PatientCardListItem) => item.patient.id, []);

  const renderPatientCardSeparator = useCallback(() => <View style={styles.cardSeparator} />, []);

  const isInitialListLoading = listLoading && !hasLoadedList;
  const hasListResults = patientCardItems.length > 0;

  return (
    <View style={styles.root}>
      {step === "list" ? (
        <Animated.View
          style={[
            styles.screenFocusWrap,
            styles.listScreenWrap,
            {
              opacity: tabEntryMotion,
              transform: [
                {
                  translateY: tabEntryMotion.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Animated.View
            key="patients-step-list"
            style={[
              styles.screenWrap,
              styles.listScreenWrap,
              {
                opacity: transition,
                transform: [
                  {
                    translateY: transition.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {/* 🚀 PERFORMANCE: FlashList como scroll primário evita nested ScrollView e habilita virtualização real. */}
            <FlashList
              data={isInitialListLoading || !hasListResults ? [] : patientCardItems}
              renderItem={renderPatientCardItem}
              keyExtractor={patientCardKeyExtractor}
              ItemSeparatorComponent={renderPatientCardSeparator}
              showsVerticalScrollIndicator={false}
              onEndReachedThreshold={0.35}
              onEndReached={() => {
                void loadMorePatients();
              }}
              refreshControl={
                <RefreshControl
                  refreshing={pullRefreshing}
                  onRefresh={() => void handlePullToRefresh()}
                  tintColor="#0F766E"
                  colors={["#0F766E"]}
                />
              }
              ListHeaderComponent={
                <View style={styles.listSummaryRow}>
                  <Text style={styles.listSummaryText}>
                    {filteredPatients.length} paciente{filteredPatients.length === 1 ? "" : "s"} na listagem.
                  </Text>
                  {listHydrating || showPullHint ? (
                    <View style={styles.listSummaryMeta}>
                      {listHydrating ? <Text style={styles.listHydratingText}>Enriquecendo cards...</Text> : null}
                      {showPullHint ? <Text style={styles.pullHintText}>Arraste para atualizar</Text> : null}
                    </View>
                  ) : null}
                </View>
              }
              ListEmptyComponent={
                isInitialListLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color="#0F766E" />
                    <Text style={styles.loadingText}>Carregando pacientes...</Text>
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateTitle}>Nenhum paciente encontrado</Text>
                    <Text style={styles.emptyStateText}>
                      Revise o termo de pesquisa no topo ou atualize a lista.
                    </Text>
                  </View>
                )
              }
              ListFooterComponent={
                <View style={styles.listFooterWrap}>
                  {listLoadingMore ? (
                    <View style={styles.loadingMoreRow}>
                      <ActivityIndicator size="small" color="#0F766E" />
                      <Text style={styles.loadingMoreText}>Carregando mais pacientes...</Text>
                    </View>
                  ) : hasLoadedList && !hasMorePatients && hasListResults ? (
                    <Text style={styles.listEndText}>Todos os pacientes carregados.</Text>
                  ) : null}
                </View>
              }
              contentContainerStyle={styles.cardsListVirtualizedContent}
            />
          </Animated.View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {info ? <Text style={styles.infoText}>{info}</Text> : null}
        </Animated.View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.container, styles.containerDetail]}
          refreshControl={
            <RefreshControl
              refreshing={pullRefreshing}
              onRefresh={() => void handlePullToRefresh()}
              tintColor="#0F766E"
              colors={["#0F766E"]}
            />
          }
        >
          <Animated.View
            style={[
              styles.screenFocusWrap,
              {
                opacity: tabEntryMotion,
                transform: [
                  {
                    translateY: tabEntryMotion.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Animated.View
              key="patients-step-detail"
              style={[
                styles.screenWrap,
                {
                  opacity: transition,
                  transform: [
                    {
                      translateY: transition.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              {detailLoading && detailPatient === null ? (
                <View style={styles.loadingRowLarge}>
                  <ActivityIndicator size="small" color="#0F766E" />
                  <Text style={styles.loadingText}>Carregando ambiente do paciente...</Text>
                </View>
              ) : detailPatient === null ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateTitle}>Paciente nao encontrado</Text>
                  <Text style={styles.emptyStateText}>
                    Volte para a listagem e selecione outro paciente.
                  </Text>
                </View>
              ) : (
                <View style={styles.detailContentStack}>
                  <PatientDetailHeroBanner
                    fullName={detailPatient.fullName}
                    initials={detailInitials}
                    ageLabel={resolveAgeLabel(detailPatient).replace("Idade: ", "")}
                    birthdayLabel={resolveBirthdayCountdownLabel(detailPatient).replace("Proximo aniversario ", "")}
                    phoneLabel={detailPhoneActionLabel}
                    onBack={backToList}
                    backButtonTestID="patients-back-to-list"
                    onPressAvatar={() => setAvatarModalVisible(true)}
                    avatarButtonTestID="patients-open-avatar"
                    onPressWhatsApp={() => selectedPatientId && void handleOpenWhatsapp(selectedPatientId)}
                    onPressPhone={() => selectedPatientId && void handleOpenCall(selectedPatientId)}
                    onPressEmergency={() => void handleOpenEmergencyCall()}
                    whatsappDisabled={detailWhatsAppDisabled}
                    phoneDisabled={detailPhoneDisabled}
                    emergencyDisabled={detailEmergencyDisabled}
                  />

                  <View style={styles.detailSection}>
                    <Text style={styles.sectionHeading}>Visao geral</Text>
                    <View style={styles.overviewDeckStack}>
                      {/* 🚀 PERFORMANCE: carrosséis paginados (padrão do painel) evitam animação de carta e mantêm 60fps. */}
                      <View style={styles.overviewDeckColumn}>
                        <PatientOverviewKpiCarousel
                          primaryDefinition={completedSessionsOverviewDefinition}
                          secondaryDefinition={upcomingSessionsOverviewDefinition}
                          primaryPreferences={OVERVIEW_DECK_PREFERENCES.completed_sessions}
                          secondaryPreferences={OVERVIEW_DECK_PREFERENCES.upcoming_sessions}
                          loading={detailLoading}
                          comparisonError={null}
                          deckHeight={overviewDeckHeight}
                        />
                      </View>
                      <View style={styles.overviewDeckColumn}>
                        <PatientOverviewKpiCarousel
                          primaryDefinition={assignedActivitiesOverviewDefinition}
                          secondaryDefinition={patientJourneyOverviewDefinition}
                          primaryPreferences={OVERVIEW_DECK_PREFERENCES.assigned_activities}
                          secondaryPreferences={OVERVIEW_DECK_PREFERENCES.patient_journey_days}
                          loading={detailLoading}
                          comparisonError={null}
                          deckHeight={overviewDeckHeight}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.sectionHeading}>Timeline integrada do paciente</Text>

                    <PatientTimelineFeed
                      items={pagedTimeline}
                      emptyMessage="Sem eventos para os filtros selecionados."
                      headerAction={(
                        <PatientTimelineFilterChips
                          chips={timelineFilterChips}
                          onToggle={(key) => handleToggleTimelineCategory(key as TimelineCategoryFilter)}
                          onCheckAll={handleCheckAllTimelineCategories}
                        />
                      )}
                    />

                    {visibleTimeline.length > TIMELINE_PAGE_SIZE ? (
                      <View style={styles.timelinePaginationRow}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setTimelinePage((current) => Math.max(1, current - 1))}
                          style={[
                            styles.timelinePaginationButton,
                            normalizedTimelinePage <= 1 ? styles.timelinePaginationButtonDisabled : null,
                          ]}
                          disabled={normalizedTimelinePage <= 1}
                        >
                          <Text style={styles.timelinePaginationButtonText}>Anterior</Text>
                        </Pressable>
                        <Text style={styles.timelinePaginationLabel}>
                          Pagina {normalizedTimelinePage} de {timelineTotalPages}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            setTimelinePage((current) => Math.min(timelineTotalPages, current + 1))
                          }
                          style={[
                            styles.timelinePaginationButton,
                            normalizedTimelinePage >= timelineTotalPages
                              ? styles.timelinePaginationButtonDisabled
                              : null,
                          ]}
                          disabled={normalizedTimelinePage >= timelineTotalPages}
                        >
                          <Text style={styles.timelinePaginationButtonText}>Proxima</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.sectionHeading}>Detalhes do contato</Text>
                    <View style={styles.contactInfoList}>
                      <View style={styles.contactInfoRow}>
                        <Ionicons name="call-outline" size={16} color="#1D4ED8" />
                        <Text style={styles.contactInfoText}>
                          {`Telefone principal: ${detailPatient.phone ?? "Nao informado"}`}
                        </Text>
                      </View>
                      <View style={styles.contactInfoRow}>
                        <Ionicons name="person-outline" size={16} color="#475467" />
                        <Text style={styles.contactInfoText}>
                          {`Contato de emergencia: ${detailPatient.emergencyContactName ?? "Nao informado"}`}
                        </Text>
                      </View>
                      <View style={styles.contactInfoRow}>
                        <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                        <Text style={styles.contactInfoText}>
                          {`Telefone de emergencia: ${detailPatient.emergencyContactPhone ?? "Nao informado"}`}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.sectionHeading}>Atividades + Formularios</Text>
                    <PatientWorkspaceFeed items={pagedWorkspaceFeedItems} />

                    {workspaceFeedItems.length > WORKSPACE_PAGE_SIZE ? (
                      <View style={styles.timelinePaginationRow}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setWorkspacePage((current) => Math.max(1, current - 1))}
                          style={[
                            styles.timelinePaginationButton,
                            normalizedWorkspacePage <= 1 ? styles.timelinePaginationButtonDisabled : null,
                          ]}
                          disabled={normalizedWorkspacePage <= 1}
                        >
                          <Text style={styles.timelinePaginationButtonText}>Anterior</Text>
                        </Pressable>
                        <Text style={styles.timelinePaginationLabel}>
                          Pagina {normalizedWorkspacePage} de {workspaceTotalPages}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            setWorkspacePage((current) => Math.min(workspaceTotalPages, current + 1))
                          }
                          style={[
                            styles.timelinePaginationButton,
                            normalizedWorkspacePage >= workspaceTotalPages
                              ? styles.timelinePaginationButtonDisabled
                              : null,
                          ]}
                          disabled={normalizedWorkspacePage >= workspaceTotalPages}
                        >
                          <Text style={styles.timelinePaginationButtonText}>Proxima</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>
              )}
            </Animated.View>
          </Animated.View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {info ? <Text style={styles.infoText}>{info}</Text> : null}
        </ScrollView>
      )}

      <Modal
        visible={avatarModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarModalVisible(false)}
      >
        <View style={styles.avatarModalOverlay}>
          <Pressable
            style={styles.avatarModalBackdrop}
            onPress={() => setAvatarModalVisible(false)}
          />
          <View style={styles.avatarModalCard}>
            <View style={styles.avatarModalCircle}>
              <Text style={styles.avatarModalInitials}>{detailInitials}</Text>
            </View>
            <Text style={styles.avatarModalName}>{detailPatient?.fullName ?? "Paciente"}</Text>
            <Text style={styles.avatarModalHint}>Visualizacao ampliada de perfil.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setAvatarModalVisible(false)}
              style={styles.avatarModalClose}
            >
              <Text style={styles.avatarModalCloseText}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F4F7FB",
  },
  container: {
    flexGrow: 1,
    backgroundColor: "#F4F7FB",
    paddingBottom: 160,
  },
  containerDetail: {
    // 🚀 PERFORMANCE: remove espaço vazio no topo do detalhe para evitar sobreposição visual e redraw desnecessário.
    paddingHorizontal: 14,
    paddingTop: 0,
  },
  screenFocusWrap: {
    gap: 0,
  },
  listScreenWrap: {
    flex: 1,
  },
  screenWrap: {
    gap: 12,
  },
  headerSearchWrap: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    marginRight: 2,
  },
  headerSearchInput: {
    flex: 1,
    minHeight: 30,
    color: "#101828",
    fontFamily: typographyContract.fontFamily,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
    paddingVertical: 0,
  },
  listSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingBottom: 10,
    gap: 8,
  },
  listSummaryMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  listSummaryText: {
    fontFamily: typographyContract.fontFamily,
    color: "#344054",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  listHydratingText: {
    fontFamily: typographyContract.fontFamily,
    color: "#0369A1",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  pullHintText: {
    fontFamily: typographyContract.fontFamily,
    color: "#64748B",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  cardsListVirtualizedContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 160,
  },
  cardSeparator: {
    height: 10,
  },
  listFooterWrap: {
    minHeight: 36,
    justifyContent: "center",
    paddingTop: 8,
  },
  loadingMoreRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingMoreText: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F766E",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
  listEndText: {
    textAlign: "center",
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  loadingRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  loadingRowLarge: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  loadingText: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  emptyStateTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: typographyContract.fontWeight,
  },
  emptyStateText: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
  detailSection: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  detailContentStack: {
    gap: 10,
  },
  overviewDeckStack: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 8,
  },
  overviewDeckColumn: {
    flex: 1,
  },
  contactInfoList: {
    gap: 8,
  },
  contactInfoRow: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  contactInfoText: {
    fontFamily: typographyContract.fontFamily,
    color: "#334155",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
    flexShrink: 1,
  },
  sectionHeading: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: typographyContract.fontWeight,
  },
  timelinePaginationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  timelinePaginationButton: {
    minHeight: 30,
    minWidth: 86,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  timelinePaginationButtonDisabled: {
    opacity: 0.5,
  },
  timelinePaginationButtonText: {
    color: "#344054",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  timelinePaginationLabel: {
    flex: 1,
    textAlign: "center",
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  errorText: {
    marginTop: 2,
    fontFamily: typographyContract.fontFamily,
    color: "#B42318",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  infoText: {
    marginTop: 2,
    fontFamily: typographyContract.fontFamily,
    color: "#0F766E",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  avatarModalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.34)",
  },
  avatarModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  avatarModalCard: {
    width: "80%",
    maxWidth: 320,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingVertical: 18,
    alignItems: "center",
    gap: 8,
  },
  avatarModalCircle: {
    width: 128,
    height: 128,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#93C5FD",
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarModalInitials: {
    fontFamily: typographyContract.fontFamily,
    color: "#1E3A8A",
    fontSize: 40,
    lineHeight: 46,
    fontWeight: typographyContract.fontWeight,
  },
  avatarModalName: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F172A",
    fontSize: 17,
    lineHeight: 23,
    fontWeight: typographyContract.fontWeight,
    textAlign: "center",
  },
  avatarModalHint: {
    fontFamily: typographyContract.fontFamily,
    color: "#64748B",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
    textAlign: "center",
  },
  avatarModalClose: {
    marginTop: 4,
    minHeight: 36,
    minWidth: 120,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  avatarModalCloseText: {
    fontFamily: typographyContract.fontFamily,
    color: "#065F46",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
});
