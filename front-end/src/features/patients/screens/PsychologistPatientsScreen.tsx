import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
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

import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";
import { shellStyles } from "../../../shared/ui/shellStyles";
import { typographyContract } from "../../../shared/ui/typography";
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
  PatientTimelineEvent,
} from "../api/types";
import { PatientContactCard } from "../components/PatientContactCard";
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
type PatientDetailTab = "overview" | "activities" | "forms" | "timeline";
type TimelineCategoryFilter =
  | NotificationCategory
  | "profile"
  | "changes"
  | "payments";

interface CombinedTimelineItem extends PatientTimelineFeedItem {
  category: TimelineCategoryFilter;
  createdAtRaw: string;
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

const DETAIL_TABS: { key: PatientDetailTab; label: string }[] = [
  { key: "overview", label: "Resumo" },
  { key: "activities", label: "Atividades" },
  { key: "forms", label: "Formularios" },
  { key: "timeline", label: "Timeline" },
];

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
  app_usage: "App",
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

function formatDatePtBr(isoDate: string | null): string {
  if (!isoDate) {
    return "Nao informado";
  }
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Nao informado";
  }
  return parsed.toLocaleDateString("pt-BR");
}

function formatDateTimePtBr(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Data indisponivel";
  }
  return parsed.toLocaleString("pt-BR");
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPatientTenure(createdAt: string): string {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return "Nao disponivel";
  }

  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  if (diffMs < 0) {
    return "Recem cadastrado";
  }

  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (totalDays < 30) {
    return `${totalDays} dia${totalDays === 1 ? "" : "s"}`;
  }

  const totalMonths = Math.floor(totalDays / 30);
  if (totalMonths < 12) {
    return `${totalMonths} mes${totalMonths === 1 ? "" : "es"}`;
  }

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (months === 0) {
    return `${years} ano${years === 1 ? "" : "s"}`;
  }
  return `${years}a ${months}m`;
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
}): Promise<SessionAgendaItem[]> {
  const { accessToken, patientId, sessionsClient, startYear } = params;
  const now = new Date();
  const currentYear = now.getFullYear();
  const normalizedStartYear = Math.max(2000, Math.min(startYear, currentYear));
  const monthDates: Date[] = [];

  for (let year = normalizedStartYear; year <= currentYear; year += 1) {
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      monthDates.push(new Date(year, monthIndex, 1));
    }
  }

  const monthResponses = await Promise.allSettled(
    monthDates.map((monthDate) =>
      sessionsClient.listAgenda(accessToken, {
        view: "month",
        referenceDate: toDateKey(monthDate),
      }),
    ),
  );

  const byId = new Map<string, SessionAgendaItem>();
  for (const response of monthResponses) {
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

  return [...byId.values()].sort(
    (left, right) =>
      new Date(right.scheduledStartAt).getTime() - new Date(left.scheduledStartAt).getTime(),
  );
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

  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [patientDetailsById, setPatientDetailsById] = useState<Record<string, PatientDetail>>({});

  const [searchQuery, setSearchQuery] = useState("");

  const [step, setStep] = useState<PatientsStep>("list");
  const [stepDirection, setStepDirection] = useState<1 | -1>(1);
  const stepMotion = useRef(new Animated.Value(1)).current;

  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<PatientDetailTab>("overview");

  const [selectedPatientDetail, setSelectedPatientDetail] = useState<PatientDetail | null>(null);
  const [selectedPatientChanges, setSelectedPatientChanges] = useState<PatientChangePreview[]>([]);
  const [selectedPatientProfileTimeline, setSelectedPatientProfileTimeline] = useState<PatientTimelineEvent[]>([]);
  const [selectedUnifiedTimeline, setSelectedUnifiedTimeline] = useState<UnifiedTimelineEvent[]>([]);
  const [selectedDeliveries, setSelectedDeliveries] = useState<NotificationDelivery[]>([]);
  const [selectedNotificationPreferences, setSelectedNotificationPreferences] =
    useState<NotificationPreferences | null>(null);
  const [selectedActivities, setSelectedActivities] = useState<ActivityItem[]>([]);
  const [selectedForms, setSelectedForms] = useState<ClinicalFormListItem[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<SessionAgendaItem[]>([]);

  const [listLoading, setListLoading] = useState(false);
  const [listHydrating, setListHydrating] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
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

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const detailsHydrationRequestIdRef = useRef(0);
  const detailLoadRequestIdRef = useRef(0);

  const runWithTokenRetry = useCallback(
    async <TResult,>(operation: (token: string) => Promise<TResult>): Promise<TResult> => {
      if (accessToken === null) {
        throw new Error("Sessao expirada. Entre novamente.");
      }

      try {
        return await operation(accessToken);
      } catch (requestError) {
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
        return operation(refreshedToken);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    stepMotion.setValue(0);
    Animated.timing(stepMotion, {
      toValue: 1,
      duration: 230,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [step, stepMotion]);

  useEffect(() => {
    let mounted = true;

    const hydratePullHint = async () => {
      try {
        const raw = await AsyncStorage.getItem(PATIENTS_PULL_HINT_SEEN_STORAGE_KEY);
        if (!mounted) {
          return;
        }
        if (raw === "1") {
          setShowPullHint(false);
          return;
        }
        setShowPullHint(true);
        await AsyncStorage.setItem(PATIENTS_PULL_HINT_SEEN_STORAGE_KEY, "1");
      } catch {
        if (mounted) {
          setShowPullHint(true);
        }
      }
    };

    void hydratePullHint();

    return () => {
      mounted = false;
    };
  }, []);

  const hydratePatientCardDetails = useCallback(
    async (items: PatientListItem[]) => {
      if (items.length === 0) {
        return;
      }

      const requestId = ++detailsHydrationRequestIdRef.current;
      setListHydrating(true);
      const responses = await Promise.allSettled(items.map(async (patient) =>
        runWithTokenRetry((token) => apiClient.get(token, patient.id)),
      ));

      if (requestId !== detailsHydrationRequestIdRef.current) {
        return;
      }

      const nextDetails: Record<string, PatientDetail> = {};
      for (const response of responses) {
        if (response.status !== "fulfilled") {
          continue;
        }
        nextDetails[response.value.id] = response.value;
      }

      setPatientDetailsById((current) => ({
        ...current,
        ...nextDetails,
      }));
      setListHydrating(false);
    },
    [apiClient, runWithTokenRetry],
  );

  const loadPatients = useCallback(async () => {
    if (accessToken === null) {
      return;
    }

    setListLoading(true);
    setError(null);
    try {
      const list = await runWithTokenRetry((token) =>
        apiClient.list(token, {
          sortBy: "full_name",
          sortOrder: "asc",
        }),
      );
      setPatients(list);
      void hydratePatientCardDetails(list);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao carregar lista de pacientes.",
      );
    } finally {
      setListLoading(false);
    }
  }, [accessToken, apiClient, hydratePatientCardDetails, runWithTokenRetry]);

  const loadSelectedPatientWorkspace = useCallback(
    async (patientId: string) => {
      if (accessToken === null) {
        return;
      }

      const requestId = ++detailLoadRequestIdRef.current;
      setDetailLoading(true);
      setError(null);

      const timelineCategories: NotificationCategory[] = [
        "sessions",
        "activities",
        "forms",
        "documents",
        "notifications",
        "app_usage",
      ];

      try {
        const [
          detailResult,
          changesResult,
          profileTimelineResult,
          unifiedTimelineResult,
          deliveriesResult,
          preferencesResult,
          activitiesResult,
          formsResult,
        ] = await Promise.allSettled([
          runWithTokenRetry((token) => apiClient.get(token, patientId)),
          runWithTokenRetry((token) => apiClient.listChanges(token, patientId, 120)),
          runWithTokenRetry((token) => apiClient.listTimelineEvents(token, patientId, 160)),
          runWithTokenRetry((token) =>
            notificationsClient.listUnifiedTimeline(token, patientId, {
              categories: timelineCategories,
              limit: 300,
            }),
          ),
          runWithTokenRetry((token) => notificationsClient.listPatientNotifications(token, patientId, 200)),
          runWithTokenRetry((token) => notificationsClient.getPatientPreferences(token, patientId)),
          runWithTokenRetry((token) => activitiesClient.listActivities(token, { limit: 500 })),
          runWithTokenRetry((token) => formsClient.listForms(token, { limit: 500 })),
        ]);

        if (requestId !== detailLoadRequestIdRef.current) {
          return;
        }

        if (detailResult.status !== "fulfilled") {
          throw detailResult.reason;
        }

        const detail = detailResult.value;
        setSelectedPatientDetail(detail);
        setPatientDetailsById((current) => ({
          ...current,
          [detail.id]: detail,
        }));

        setSelectedPatientChanges(
          changesResult.status === "fulfilled"
            ? changesResult.value.map((entry) => {
                const when = formatDateTimePtBr(entry.createdAt);
                const fields =
                  entry.changedFields.length > 0
                    ? entry.changedFields.join(", ")
                    : "sem campos detalhados";
                return {
                  id: entry.id,
                  summary: `${entry.changeType} | ${fields} | ${when}`,
                  createdAt: entry.createdAt,
                };
              })
            : [],
        );

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

        const activities =
          activitiesResult.status === "fulfilled"
            ? activitiesResult.value.filter((item) => item.patientId === patientId)
            : [];
        setSelectedActivities(
          [...activities].sort(
            (left, right) => new Date(right.assignedAt).getTime() - new Date(left.assignedAt).getTime(),
          ),
        );

        const forms =
          formsResult.status === "fulfilled"
            ? formsResult.value.filter((item) => item.patientId === patientId)
            : [];
        setSelectedForms(
          [...forms].sort((left, right) => {
            const leftAnchor = left.assignedAt ?? left.scheduledSendAt ?? left.publishedAt ?? "";
            const rightAnchor = right.assignedAt ?? right.scheduledSendAt ?? right.publishedAt ?? "";
            return new Date(rightAnchor).getTime() - new Date(leftAnchor).getTime();
          }),
        );

        let sessionsLoadFailed = false;
        try {
          const startYear = new Date(detail.createdAt).getFullYear();
          const sessions = await runWithTokenRetry((token) =>
            loadPatientSessionsFromYearRange({
              accessToken: token,
              patientId,
              startYear: Number.isFinite(startYear) ? startYear : new Date().getFullYear(),
              sessionsClient,
            }),
          );
          if (requestId === detailLoadRequestIdRef.current) {
            setSelectedSessions(sessions);
          }
        } catch {
          sessionsLoadFailed = true;
          if (requestId === detailLoadRequestIdRef.current) {
            setSelectedSessions([]);
          }
        }

        const partialFailures = [
          changesResult,
          profileTimelineResult,
          unifiedTimelineResult,
          deliveriesResult,
          preferencesResult,
          activitiesResult,
          formsResult,
        ].some((result) => result.status === "rejected");
        const hasAnyPartialFailure = partialFailures || sessionsLoadFailed;

        setInfo(
          hasAnyPartialFailure
            ? "Perfil carregado com dados parciais. Atualize para sincronizar tudo."
            : "Paciente carregado com timeline integrada.",
        );
      } catch (requestError) {
        if (requestId !== detailLoadRequestIdRef.current) {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Falha ao carregar a visao interna do paciente.",
        );
      } finally {
        if (requestId === detailLoadRequestIdRef.current) {
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
      runWithTokenRetry,
      sessionsClient,
    ],
  );

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  const headerSearchWidth = useMemo(() => {
    const relative = Math.round(viewportWidth * 0.31);
    return Math.min(176, Math.max(112, relative));
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
                  placeholder={searchFocused ? "" : "Buscar"}
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

  const filteredPatients = useMemo(() => {
    const normalized = normalizeSearch(searchQuery);
    if (normalized.length === 0) {
      return patients;
    }

    return patients.filter((patient) => {
      const details = patientDetailsById[patient.id] ?? null;
      return resolvePatientSearchBlob(patient, details).includes(normalized);
    });
  }, [patientDetailsById, patients, searchQuery]);

  const detailPatient = selectedPatientDetail ??
    (selectedPatientId ? patientDetailsById[selectedPatientId] ?? null : null);

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

  const combinedTimeline = useMemo<CombinedTimelineItem[]>(() => {
    const items: CombinedTimelineItem[] = [];

    for (const event of selectedUnifiedTimeline) {
      const category = classifyUnifiedEventCategory(event);
      const payloadEntries = Object.entries(event.payload).slice(0, 2);
      const payloadPreview = payloadEntries
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" | ");

      items.push({
        id: `unified-${event.id}`,
        category,
        title: `${TIMELINE_CATEGORY_LABEL[category]} | ${event.eventType}`,
        subtitle:
          payloadPreview.length > 0
            ? payloadPreview
            : `Interacao registrada por ${event.actorType}.`,
        timestampLabel: formatDateTimePtBr(event.createdAt),
        accentColor: TIMELINE_ACCENT_COLOR[category],
        createdAtRaw: event.createdAt,
      });
    }

    for (const event of selectedPatientProfileTimeline) {
      const payloadEntries = Object.entries(event.payload).slice(0, 2);
      const payloadPreview = payloadEntries
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" | ");

      items.push({
        id: `profile-${event.id}`,
        category: "profile",
        title: `Cadastro | ${event.eventType}`,
        subtitle:
          payloadPreview.length > 0
            ? payloadPreview
            : `Evento cadastral por ${event.actorType}.`,
        timestampLabel: formatDateTimePtBr(event.createdAt),
        accentColor: TIMELINE_ACCENT_COLOR.profile,
        createdAtRaw: event.createdAt,
      });
    }

    for (const entry of selectedPatientChanges) {
      items.push({
        id: `changes-${entry.id}`,
        category: "changes",
        title: "Mudanca de cadastro",
        subtitle: entry.summary,
        timestampLabel: "Historico de alteracao",
        accentColor: TIMELINE_ACCENT_COLOR.changes,
        createdAtRaw: entry.createdAt,
      });
    }

    for (const delivery of selectedDeliveries) {
      items.push({
        id: `delivery-${delivery.id}`,
        category: "notifications",
        title: `Entrega | ${delivery.title}`,
        subtitle: `${delivery.status} | ${delivery.category}`,
        timestampLabel: formatDateTimePtBr(delivery.createdAt),
        accentColor: TIMELINE_ACCENT_COLOR.notifications,
        createdAtRaw: delivery.createdAt,
      });
    }

    return items.sort(
      (left, right) => new Date(right.createdAtRaw).getTime() - new Date(left.createdAtRaw).getTime(),
    );
  }, [
    selectedDeliveries,
    selectedPatientChanges,
    selectedPatientProfileTimeline,
    selectedUnifiedTimeline,
  ]);

  const visibleTimeline = useMemo<PatientTimelineFeedItem[]>(
    () =>
      combinedTimeline.filter((item) => timelineFilters[item.category]).map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        timestampLabel: item.timestampLabel,
        accentColor: item.accentColor,
      })),
    [combinedTimeline, timelineFilters],
  );

  const openDetail = useCallback(
    (patientId: string) => {
      setSelectedPatientId(patientId);
      setDetailTab("overview");
      setStepDirection(1);
      setStep("detail");
      void loadSelectedPatientWorkspace(patientId);
    },
    [loadSelectedPatientWorkspace],
  );

  const backToList = useCallback(() => {
    setStepDirection(-1);
    setStep("list");
    setDetailTab("overview");
    setInfo(null);
  }, []);

  const handleOpenWhatsapp = useCallback(
    async (patientId: string) => {
      const patient = patients.find((item) => item.id === patientId) ?? null;
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
    [patientDetailsById, patients],
  );

  const handleOpenCall = useCallback(
    async (patientId: string) => {
      const patient = patients.find((item) => item.id === patientId) ?? null;
      const details = patientDetailsById[patientId] ?? null;
      const phoneRaw = details?.phone ?? patient?.phone ?? null;
      if (phoneRaw === null || phoneRaw.trim().length < 8) {
        setError("Paciente sem telefone valido para ligacao.");
        return;
      }

      try {
        const phone = sanitizePhoneForDial(phoneRaw);
        await Linking.openURL(`tel:${phone}`);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Nao foi possivel abrir o atalho de ligacao.",
        );
      }
    },
    [patientDetailsById, patients],
  );

  const handleContactActionUnavailable = useCallback((message: string) => {
    setError(null);
    setInfo(message);
  }, []);

  const handleToggleTimelineCategory = useCallback((category: TimelineCategoryFilter) => {
    setTimelineFilters((current) => ({
      ...current,
      [category]: !current[category],
    }));
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

  const stepTranslateX = stepMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [stepDirection * 26, 0],
  });

  const stepOpacity = stepMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1],
  });

  const detailDescription = detailPatient?.communicationNotes?.trim()
    ? detailPatient.communicationNotes.trim()
    : "Paciente sem descricao longa no cadastro. Use esta area para centralizar contexto clinico e observacoes recorrentes.";

  return (
    <ScreenFadeIn>
      <ScrollView
        contentContainerStyle={[styles.container, shellStyles.scrollContainer]}
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
            styles.screenWrap,
            {
              opacity: stepOpacity,
              transform: [{ translateX: stepTranslateX }],
            },
          ]}
        >
          {step === "list" ? (
            <>
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

              {listLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#0F766E" />
                  <Text style={styles.loadingText}>Carregando pacientes...</Text>
                </View>
              ) : filteredPatients.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateTitle}>Nenhum paciente encontrado</Text>
                  <Text style={styles.emptyStateText}>
                    Revise o termo de pesquisa no topo ou atualize a lista.
                  </Text>
                </View>
              ) : (
                <View style={styles.cardsList}>
                  {filteredPatients.map((patient) => {
                    const detail = patientDetailsById[patient.id] ?? null;
                    const summary = resolveSummary(patient, detail);
                    const ageLabel = resolveAgeLabel(detail);
                    const birthdayLabel = resolveBirthdayCountdownLabel(detail);
                    return (
                      <PatientContactCard
                        key={patient.id}
                        patient={patient}
                        summary={summary}
                        ageLabel={ageLabel}
                        birthdayLabel={birthdayLabel}
                        onOpenProfile={openDetail}
                        onOpenWhatsapp={handleOpenWhatsapp}
                        onOpenCall={handleOpenCall}
                        onActionUnavailable={handleContactActionUnavailable}
                        whatsappDisabled={
                          (detail?.phone ?? patient.phone ?? "").trim().length < 8 &&
                          (detail?.email ?? patient.email ?? "").trim().length === 0
                        }
                        callDisabled={(detail?.phone ?? patient.phone ?? "").trim().length < 8}
                      />
                    );
                  })}
                </View>
              )}
            </>
          ) : (
            <>
              <View style={styles.detailActionsRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={backToList}
                  style={styles.detailActionButton}
                  testID="patients-back-to-list"
                >
                  <Ionicons name="arrow-back" size={15} color="#334155" />
                  <Text style={styles.detailActionText}>Voltar para pacientes</Text>
                </Pressable>
              </View>

              {detailLoading ? (
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
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.detailTabsRow}
                  >
                    {DETAIL_TABS.map((tab) => (
                      <Pressable
                        key={tab.key}
                        accessibilityRole="button"
                        onPress={() => setDetailTab(tab.key)}
                        style={[styles.detailTabButton, detailTab === tab.key ? styles.detailTabButtonActive : null]}
                      >
                        <Text
                          style={[
                            styles.detailTabButtonText,
                            detailTab === tab.key ? styles.detailTabButtonTextActive : null,
                          ]}
                        >
                          {tab.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  {detailTab === "overview" ? (
                    <View style={styles.detailSection}>
                      <View style={styles.patientHeroCard}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setAvatarModalVisible(true)}
                          style={styles.heroAvatar}
                          testID="patients-open-avatar"
                        >
                          <Text style={styles.heroAvatarText}>
                            {detailPatient.fullName
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((token) => token[0]?.toUpperCase() ?? "")
                              .join("") || "P"}
                          </Text>
                        </Pressable>
                        <View style={styles.heroBody}>
                          <Text style={styles.heroTitle}>{detailPatient.fullName}</Text>
                          <Text style={styles.heroSubtitle}>{resolveAgeLabel(detailPatient)}</Text>
                          <Text style={styles.heroSubtitle}>{resolveBirthdayCountdownLabel(detailPatient)}</Text>
                          <Text style={styles.heroSubtitle}>
                            Data de aniversario: {formatDatePtBr(detailPatient.birthDate)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.statsGrid}>
                        <StatCard label="Tempo de paciente" value={formatPatientTenure(detailPatient.createdAt)} />
                        <StatCard label="Sessoes realizadas" value={String(completedSessionsCount)} />
                        <StatCard label="Sessoes futuras" value={String(upcomingSessionsCount)} />
                        <StatCard label="Atividades atribuidas" value={String(selectedActivities.length)} />
                      </View>

                      <View style={styles.inlineActionsRow}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => selectedPatientId && void handleOpenWhatsapp(selectedPatientId)}
                          style={styles.inlineActionButton}
                        >
                          <Ionicons name="logo-whatsapp" size={14} color="#166534" />
                          <Text style={styles.inlineActionText}>WhatsApp</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => selectedPatientId && void handleOpenCall(selectedPatientId)}
                          style={styles.inlineActionButton}
                        >
                          <Ionicons name="call-outline" size={14} color="#0F766E" />
                          <Text style={styles.inlineActionText}>Ligar</Text>
                        </Pressable>
                      </View>

                      <View style={styles.textBlock}>
                        <Text style={styles.blockTitle}>Descricao completa</Text>
                        <Text style={styles.blockText}>{detailDescription}</Text>
                      </View>

                      <View style={styles.textBlock}>
                        <Text style={styles.blockTitle}>Informacoes relevantes</Text>
                        <Text style={styles.blockText}>
                          Canal preferido: {detailPatient.preferredContactChannel}
                        </Text>
                        <Text style={styles.blockText}>
                          Periodo preferido: {detailPatient.preferredContactPeriod ?? "nao informado"}
                        </Text>
                        <Text style={styles.blockText}>
                          Contato de emergencia: {detailPatient.emergencyContactName ?? "nao informado"}
                        </Text>
                        <Text style={styles.blockText}>
                          Telefone emergencia: {detailPatient.emergencyContactPhone ?? "nao informado"}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {detailTab === "activities" ? (
                    <View style={styles.detailSection}>
                      <Text style={styles.sectionHeading}>
                        Atividades atribuidas ({selectedActivities.length})
                      </Text>
                      {selectedActivities.length === 0 ? (
                        <Text style={styles.emptyInlineText}>
                          Nenhuma atividade atribuida para este paciente.
                        </Text>
                      ) : (
                        selectedActivities.map((activity) => (
                          <View key={activity.id} style={styles.feedCard}>
                            <Text style={styles.feedTitle}>{activity.title}</Text>
                            <Text style={styles.feedMeta}>
                              Status: {activity.status} | Tipo: {activity.activityType}
                            </Text>
                            <Text style={styles.feedMeta}>
                              Atribuida em {formatDateTimePtBr(activity.assignedAt)}
                            </Text>
                            <Text style={styles.feedMeta}>Prazo: {formatDateTimePtBr(activity.dueAt)}</Text>
                          </View>
                        ))
                      )}
                    </View>
                  ) : null}

                  {detailTab === "forms" ? (
                    <View style={styles.detailSection}>
                      <Text style={styles.sectionHeading}>
                        Formularios vinculados ({selectedForms.length})
                      </Text>
                      {selectedForms.length === 0 ? (
                        <Text style={styles.emptyInlineText}>
                          Nenhum formulario associado ao paciente no momento.
                        </Text>
                      ) : (
                        selectedForms.map((form) => (
                          <View key={form.id} style={styles.feedCard}>
                            <Text style={styles.feedTitle}>{form.title}</Text>
                            <Text style={styles.feedMeta}>Status: {form.status}</Text>
                            <Text style={styles.feedMeta}>
                              Atribuido em{" "}
                              {form.assignedAt || form.publishedAt
                                ? formatDateTimePtBr(form.assignedAt ?? form.publishedAt ?? "")
                                : "nao informado"}
                            </Text>
                            <Text style={styles.feedMeta}>
                              Aberto em {form.scheduledSendAt ? formatDateTimePtBr(form.scheduledSendAt) : "nao agendado"}
                            </Text>
                            <Text style={styles.feedMeta}>
                              Submetido em {form.submittedAt ? formatDateTimePtBr(form.submittedAt) : "ainda nao"}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                  ) : null}

                  {detailTab === "timeline" ? (
                    <View style={styles.detailSection}>
                      <Text style={styles.sectionHeading}>Timeline integrada do paciente</Text>
                      <Text style={styles.timelineHint}>
                        Linha do tempo vertical em tempo real com eventos de sessoes, atividades,
                        formularios, notificacoes e cadastro.
                      </Text>

                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.timelineFilterRow}
                      >
                        {TIMELINE_CATEGORY_FILTERS.map((category) => (
                          <Pressable
                            key={category}
                            accessibilityRole="button"
                            onPress={() => handleToggleTimelineCategory(category)}
                            style={[
                              styles.timelineFilterChip,
                              timelineFilters[category] ? styles.timelineFilterChipActive : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.timelineFilterChipText,
                                timelineFilters[category]
                                  ? styles.timelineFilterChipTextActive
                                  : null,
                              ]}
                            >
                              {TIMELINE_CATEGORY_LABEL[category]}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>

                      <PatientTimelineFeed
                        items={visibleTimeline}
                        emptyMessage="Sem eventos para os filtros selecionados."
                      />

                      {selectedNotificationPreferences ? (
                        <Text style={styles.preferencesMeta}>
                          Preferencias: max/h {selectedNotificationPreferences.maxNotificationsPerHour} |
                          origem {selectedNotificationPreferences.source}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </>
              )}
            </>
          )}
        </Animated.View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}
      </ScrollView>

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
              <Text style={styles.avatarModalInitials}>
                {(detailPatient?.fullName ?? "Paciente")
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((token) => token[0]?.toUpperCase() ?? "")
                  .join("") || "P"}
              </Text>
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
    </ScreenFadeIn>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F4F7FB",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 160,
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
  detailActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },
  detailActionButton: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  detailActionText: {
    fontFamily: typographyContract.fontFamily,
    color: "#334155",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  listSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
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
  cardsList: {
    gap: 10,
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
  detailTabsRow: {
    gap: 8,
    paddingBottom: 2,
  },
  detailTabButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    minHeight: 34,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTabButtonActive: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF3",
  },
  detailTabButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#334155",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
  detailTabButtonTextActive: {
    color: "#065F46",
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
  patientHeroCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  heroAvatar: {
    width: 74,
    height: 74,
    borderRadius: 999,
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "#93C5FD",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarText: {
    fontFamily: typographyContract.fontFamily,
    color: "#1E3A8A",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: typographyContract.fontWeight,
  },
  heroBody: {
    flex: 1,
    gap: 2,
  },
  heroTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F172A",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: typographyContract.fontWeight,
  },
  heroSubtitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#334155",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statCard: {
    width: "48%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  statLabel: {
    fontFamily: typographyContract.fontFamily,
    color: "#64748B",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  statValue: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F172A",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: typographyContract.fontWeight,
  },
  inlineActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  inlineActionButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  inlineActionText: {
    fontFamily: typographyContract.fontFamily,
    color: "#166534",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  textBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
    paddingVertical: 10,
    gap: 3,
  },
  blockTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F172A",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  blockText: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
  sectionHeading: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: typographyContract.fontWeight,
  },
  emptyInlineText: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
  feedCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
    paddingVertical: 10,
    gap: 3,
  },
  feedTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F172A",
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  feedMeta: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  timelineHint: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  timelineFilterRow: {
    gap: 8,
  },
  timelineFilterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineFilterChipActive: {
    borderColor: "#0369A1",
    backgroundColor: "#E0F2FE",
  },
  timelineFilterChipText: {
    fontFamily: typographyContract.fontFamily,
    color: "#334155",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  timelineFilterChipTextActive: {
    color: "#075985",
  },
  preferencesMeta: {
    fontFamily: typographyContract.fontFamily,
    color: "#344054",
    fontSize: 11.5,
    lineHeight: 15,
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
