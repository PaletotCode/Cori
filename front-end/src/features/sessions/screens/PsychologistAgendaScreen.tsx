import { useNavigation, useRouter } from "expo-router";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";

import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";
import { shellStyles } from "../../../shared/ui/shellStyles";
import {
  createActivitiesApiClient,
  type ActivitiesApiClient,
} from "../../activities/api/activitiesApiClient";
import {
  createActivityTemplatesApiClient,
  type ActivityTemplatesApiClient,
} from "../../activities/api/activityTemplatesApiClient";
import type {
  ActivityDetail,
  ActivityItem,
  ActivityTemplateListItem,
} from "../../activities/api/types";
import { useAuthStore } from "../../auth/hooks/useAuthStore";
import {
  createFormsApiClient,
  type FormsApiClient,
} from "../../forms/api/formsApiClient";
import {
  createFormTemplatesApiClient,
  type FormTemplatesApiClient,
} from "../../forms/api/formTemplatesApiClient";
import type {
  ClinicalFormDetail,
  ClinicalFormListItem,
  FormTemplateListItem,
} from "../../forms/api/types";
import { psychologistRoutes } from "../../navigation/guards";
import { useNotificationsStore } from "../../notifications/hooks/useNotificationsStore";
import { createPatientsApiClient, type PatientsApiClient } from "../../patients/api/patientsApiClient";
import type { PatientListItem } from "../../patients/api/types";
import {
  AgendaAssignSheet,
  AgendaHeaderActions,
  AppleAgendaCalendar,
  type AgendaAssignFlowStatus,
  type AgendaAssignMode,
  type AgendaCalendarEvent,
  type AppleCalendarMode,
  type AppleCalendarScope,
  type AssignActivityDraft,
  type AssignFormDraft,
  type AssignSessionDraft,
} from "../components/apple-calendar";
import {
  addMonths,
  combineDateAndTime,
  fromDateKey,
  monthLabel,
  startOfMonth,
  toDateKeyFromDate,
  toDateKeyFromIso,
  toMonthKey,
} from "../components/apple-calendar/dateUtils";
import { createSessionsApiClient, type SessionsApiClient } from "../api/sessionsApiClient";
import type { SessionAgendaItem } from "../api/types";

const sessionsApiClient = createSessionsApiClient();
const patientsApiClient = createPatientsApiClient();
const activitiesApiClient = createActivitiesApiClient();
const activityTemplatesApiClient = createActivityTemplatesApiClient();
const formsApiClient = createFormsApiClient();
const formTemplatesApiClient = createFormTemplatesApiClient();

const INITIAL_FLOW_STATUS: Record<AgendaAssignMode, AgendaAssignFlowStatus> = {
  session: "idle",
  activity: "idle",
  form: "idle",
};

const INITIAL_FLOW_ERRORS: Partial<Record<AgendaAssignMode, string | null>> = {
  session: null,
  activity: null,
  form: null,
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

interface AgendaScreenCache {
  patients: PatientListItem[];
  activities: ActivityItem[];
  forms: ClinicalFormListItem[];
  activityTemplates: ActivityTemplateListItem[];
  formTemplates: FormTemplateListItem[];
  sessionsByMonth: Record<string, SessionAgendaItem[]>;
  scope: AppleCalendarScope;
  mode: AppleCalendarMode;
  focusedMonthDateKey: string;
  selectedDateKey: string;
  contextLoaded: boolean;
  calendarLoaded: boolean;
}

let agendaScreenCache: AgendaScreenCache | null = null;
const AGENDA_REQUEST_ABORTED_ERROR_NAME = "PsychologistAgendaRequestAborted";

interface EventsByDateBuckets {
  [dateKey: string]: AgendaCalendarEvent[];
}

function createAgendaRequestAbortedError(): Error {
  const error = new Error("Solicitacao interrompida.");
  error.name = AGENDA_REQUEST_ABORTED_ERROR_NAME;
  return error;
}

function isAgendaRequestAbortedError(error: unknown): boolean {
  return error instanceof Error && error.name === AGENDA_REQUEST_ABORTED_ERROR_NAME;
}

interface PsychologistAgendaScreenProps {
  apiClient?: SessionsApiClient;
  activitiesClient?: ActivitiesApiClient;
  activityTemplatesClient?: ActivityTemplatesApiClient;
  formsClient?: FormsApiClient;
  formTemplatesClient?: FormTemplatesApiClient;
  patientsClient?: PatientsApiClient;
}

function sessionColor(status: SessionAgendaItem["status"]): string {
  if (status === "confirmed" || status === "completed") {
    return "#54A7F8";
  }
  if (status === "scheduled" || status === "rescheduled") {
    return "#68B8FF";
  }
  return "#98A2B3";
}

function resolveActivityDate(activity: ActivityItem): string {
  return activity.scheduledSendAt ?? activity.assignedAt ?? activity.dueAt;
}

function resolveFormDate(form: ClinicalFormListItem): string | null {
  return form.scheduledSendAt ?? form.assignedAt ?? form.submittedAt ?? form.publishedAt;
}

function monthScopeFromDateKey(dateKey: string): Date {
  const parsed = fromDateKey(dateKey);
  return startOfMonth(parsed);
}

function normalizeSelectedDateForMonth(selectedDateKey: string, monthDate: Date): string {
  const selected = fromDateKey(selectedDateKey);
  const month = monthDate.getMonth();
  const year = monthDate.getFullYear();
  const maxDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(selected.getDate(), maxDay);
  return toDateKeyFromDate(new Date(year, month, day));
}

function normalizeCalendarMode(mode: string | null | undefined): AppleCalendarMode {
  if (mode === "stack" || mode === "details" || mode === "list") {
    return mode;
  }
  return "list";
}

function createIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function resolveAsyncErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallbackMessage;
}

function upsertById<TItem extends { id: string }>(items: TItem[], nextItem: TItem): TItem[] {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index < 0) {
    return [nextItem, ...items];
  }
  const nextItems = [...items];
  nextItems[index] = nextItem;
  return nextItems;
}

function mapActivityDetailToItem(detail: ActivityDetail): ActivityItem {
  return {
    id: detail.id,
    patientId: detail.patientId,
    patientName: detail.patientName,
    psychologistId: detail.psychologistId,
    sourceTemplateId: detail.sourceTemplateId ?? null,
    activityType: detail.activityType,
    status: detail.status,
    title: detail.title,
    dueAt: detail.dueAt,
    scheduledSendAt: detail.scheduledSendAt ?? null,
    assignedAt: detail.assignedAt,
    overdueAt: detail.overdueAt,
    recurrenceRule: detail.recurrenceRule,
    recurrenceInterval: detail.recurrenceInterval,
    recurrenceEndAt: detail.recurrenceEndAt,
    executionElapsedSeconds: detail.executionElapsedSeconds,
  };
}

function mapFormDetailToItem(detail: ClinicalFormDetail): ClinicalFormListItem {
  return {
    id: detail.id,
    patientId: detail.patientId,
    patientName: detail.patientName,
    psychologistId: detail.psychologistId,
    sourceTemplateId: detail.sourceTemplateId ?? null,
    status: detail.status,
    title: detail.title,
    subtitle: detail.subtitle,
    publishedAt: detail.publishedAt,
    scheduledSendAt: detail.scheduledSendAt,
    assignedAt: detail.assignedAt,
    submittedAt: detail.submittedAt,
    reviewedAt: detail.reviewedAt,
  };
}

function upsertSessionIntoMonth(
  current: Record<string, SessionAgendaItem[]>,
  session: SessionAgendaItem,
): Record<string, SessionAgendaItem[]> {
  const parsedDate = new Date(session.scheduledStartAt);
  const monthDate = Number.isNaN(parsedDate.getTime()) ? startOfMonth(new Date()) : startOfMonth(parsedDate);
  const monthKey = toMonthKey(monthDate);
  const currentMonthItems = current[monthKey] ?? [];
  return {
    ...current,
    [monthKey]: upsertById(currentMonthItems, session),
  };
}

function toDateKeySafe(isoDate: string): string {
  return toDateKeyFromIso(isoDate);
}

function mapBucketsToMap(buckets: EventsByDateBuckets): ReadonlyMap<string, AgendaCalendarEvent[]> {
  return new Map(Object.entries(buckets));
}

function buildEventsByDateBuckets(params: {
  sessionsByMonth: Record<string, SessionAgendaItem[]>;
  activities: ActivityItem[];
  forms: ClinicalFormListItem[];
}): EventsByDateBuckets {
  const { sessionsByMonth, activities, forms } = params;
  const buckets: EventsByDateBuckets = {};

  for (const monthSessions of Object.values(sessionsByMonth)) {
    for (const session of monthSessions) {
      const event: AgendaCalendarEvent = {
        id: session.id,
        title: session.patientName,
        startsAt: session.scheduledStartAt,
        endsAt: session.scheduledEndAt,
        type: "session",
        color: sessionColor(session.status),
        patientName: session.patientName,
      };
      const dateKey = toDateKeySafe(event.startsAt);
      if (buckets[dateKey] === undefined) {
        buckets[dateKey] = [event];
      } else {
        buckets[dateKey].push(event);
      }
    }
  }

  for (const activity of activities) {
    const eventDate = resolveActivityDate(activity);
    const event: AgendaCalendarEvent = {
      id: activity.id,
      title: activity.title,
      startsAt: eventDate,
      endsAt: eventDate,
      type: "activity",
      color: activity.status === "scheduled" ? "#C688DD" : "#D89AE8",
      patientName: activity.patientName,
    };
    const dateKey = toDateKeySafe(event.startsAt);
    if (buckets[dateKey] === undefined) {
      buckets[dateKey] = [event];
    } else {
      buckets[dateKey].push(event);
    }
  }

  for (const form of forms) {
    const formDate = resolveFormDate(form);
    if (formDate === null) {
      continue;
    }
    const event: AgendaCalendarEvent = {
      id: form.id,
      title: form.title,
      startsAt: formDate,
      endsAt: formDate,
      type: "form",
      color: "#9D7FEA",
      patientName: form.patientName,
    };
    const dateKey = toDateKeySafe(event.startsAt);
    if (buckets[dateKey] === undefined) {
      buckets[dateKey] = [event];
    } else {
      buckets[dateKey].push(event);
    }
  }

  for (const dateKey of Object.keys(buckets)) {
    buckets[dateKey].sort(
      (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    );
  }

  return buckets;
}

export function PsychologistAgendaScreen({
  apiClient = sessionsApiClient,
  activitiesClient = activitiesApiClient,
  activityTemplatesClient = activityTemplatesApiClient,
  formsClient = formsApiClient,
  formTemplatesClient = formTemplatesApiClient,
  patientsClient = patientsApiClient,
}: PsychologistAgendaScreenProps) {
  const navigation = useNavigation();
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null);
  const latestNotification = useNotificationsStore((state) => state.items[0] ?? null);
  const lastHandledRealtimeNotificationIdRef = useRef<string | null>(null);

  const [patients, setPatients] = useState<PatientListItem[]>(() => agendaScreenCache?.patients ?? []);
  const [activities, setActivities] = useState<ActivityItem[]>(() => agendaScreenCache?.activities ?? []);
  const [forms, setForms] = useState<ClinicalFormListItem[]>(() => agendaScreenCache?.forms ?? []);
  const [activityTemplates, setActivityTemplates] = useState<ActivityTemplateListItem[]>(
    () => agendaScreenCache?.activityTemplates ?? [],
  );
  const [formTemplates, setFormTemplates] = useState<FormTemplateListItem[]>(
    () => agendaScreenCache?.formTemplates ?? [],
  );
  const [sessionsByMonth, setSessionsByMonth] = useState<Record<string, SessionAgendaItem[]>>(
    () => agendaScreenCache?.sessionsByMonth ?? {},
  );

  const [scope, setScope] = useState<AppleCalendarScope>(() => agendaScreenCache?.scope ?? "year");
  const [mode, setMode] = useState<AppleCalendarMode>(() =>
    normalizeCalendarMode(agendaScreenCache?.mode),
  );

  const [focusedMonth, setFocusedMonth] = useState(() =>
    agendaScreenCache?.focusedMonthDateKey
      ? monthScopeFromDateKey(agendaScreenCache.focusedMonthDateKey)
      : startOfMonth(new Date()),
  );
  const [selectedDateKey, setSelectedDateKey] = useState(
    () => agendaScreenCache?.selectedDateKey ?? toDateKeyFromDate(new Date()),
  );

  const [loadingContext, setLoadingContext] = useState(false);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(
    () => agendaScreenCache?.contextLoaded ?? false,
  );
  const [calendarLoaded, setCalendarLoaded] = useState(
    () => agendaScreenCache?.calendarLoaded ?? false,
  );

  const [flowStatusByMode, setFlowStatusByMode] =
    useState<Record<AgendaAssignMode, AgendaAssignFlowStatus>>(INITIAL_FLOW_STATUS);
  const [flowErrorsByMode, setFlowErrorsByMode] =
    useState<Partial<Record<AgendaAssignMode, string | null>>>(INITIAL_FLOW_ERRORS);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [eventsByDate, setEventsByDate] = useState<ReadonlyMap<string, AgendaCalendarEvent[]>>(() =>
    mapBucketsToMap(
      buildEventsByDateBuckets({
        sessionsByMonth: agendaScreenCache?.sessionsByMonth ?? {},
        activities: agendaScreenCache?.activities ?? [],
        forms: agendaScreenCache?.forms ?? [],
      }),
    ),
  );

  const isMountedRef = useRef(true);
  const contextLoadedRef = useRef(contextLoaded);
  const calendarLoadedRef = useRef(calendarLoaded);
  const contextLoadRequestIdRef = useRef(0);
  const calendarLoadRequestIdRef = useRef(0);
  const templatesLoadRequestIdRef = useRef(0);
  const eventsComputationRequestIdRef = useRef(0);
  const previousScopeBeforeDayRef = useRef<AppleCalendarScope>("month");
  const previousModeBeforeDayRef = useRef<AppleCalendarMode>("list");

  useEffect(() => {
    contextLoadedRef.current = contextLoaded;
  }, [contextLoaded]);

  useEffect(() => {
    calendarLoadedRef.current = calendarLoaded;
  }, [calendarLoaded]);

  useEffect(() => {
    // 🚀 PERFORMANCE: cleanup centralizado evita listeners/requisicoes ativas apos unmount.
    return () => {
      isMountedRef.current = false;
      contextLoadRequestIdRef.current += 1;
      calendarLoadRequestIdRef.current += 1;
      templatesLoadRequestIdRef.current += 1;
      eventsComputationRequestIdRef.current += 1;
    };
  }, []);

  const todayDateKey = useMemo(() => toDateKeyFromDate(new Date()), []);

  const loading = (loadingContext && !contextLoaded) || (loadingCalendar && !calendarLoaded);

  const statusLabel = useMemo(
    () =>
      scope === "year"
        ? `Ano ${focusedMonth.getFullYear()}`
        : scope === "month"
          ? `${monthLabel(focusedMonth)} ${focusedMonth.getFullYear()}`
          : undefined,
    [focusedMonth, scope],
  );

  const normalizedErrorMessage = useMemo(() => {
    if (errorMessage === null) {
      return null;
    }
    const normalized = errorMessage.trim().toLowerCase();
    if (normalized === "not found") {
      return null;
    }
    return errorMessage;
  }, [errorMessage]);

  const updateFlowState = useCallback(
    (mode: AgendaAssignMode, status: AgendaAssignFlowStatus, error: string | null = null) => {
      setFlowStatusByMode((current) => ({
        ...current,
        [mode]: status,
      }));
      setFlowErrorsByMode((current) => ({
        ...current,
        [mode]: error,
      }));
    },
    [],
  );

  const computeEventsByDateOnRuntime = useCallback(
    async (
      nextSessionsByMonth: Record<string, SessionAgendaItem[]>,
      nextActivities: ActivityItem[],
      nextForms: ClinicalFormListItem[],
    ) => {
      // 🚀 PERFORMANCE: agregacao pesada sai do frame atual com defer assíncrono para manter interacao fluida no Expo Go.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      return buildEventsByDateBuckets({
        sessionsByMonth: nextSessionsByMonth,
        activities: nextActivities,
        forms: nextForms,
      });
    },
    [],
  );

  const refreshMonthSessions = useCallback(
    async (monthDate: Date) => {
      if (accessToken === null) {
        return;
      }
      const monthKey = toMonthKey(monthDate);
      const response = await apiClient.listAgenda(accessToken, {
        view: "month",
        referenceDate: toDateKeyFromDate(monthDate),
      });
      // 🚀 PERFORMANCE: atualização de calendário em transição evita bloqueio visual durante fetch incremental.
      startTransition(() => {
        setSessionsByMonth((current) => ({
          ...current,
          [monthKey]: response,
        }));
      });
    },
    [accessToken, apiClient],
  );

  const refreshMonthsForDateKeys = useCallback(
    async (dateKeys: string[]) => {
      const uniqueMonthDates = new Map<string, Date>();
      for (const dateKey of dateKeys) {
        if (dateKey.trim().length < 10) {
          continue;
        }
        const monthDate = monthScopeFromDateKey(dateKey);
        uniqueMonthDates.set(toMonthKey(monthDate), monthDate);
      }
      if (uniqueMonthDates.size === 0) {
        uniqueMonthDates.set(toMonthKey(focusedMonth), focusedMonth);
      }
      await Promise.all([...uniqueMonthDates.values()].map(async (monthDate) => refreshMonthSessions(monthDate)));
    },
    [focusedMonth, refreshMonthSessions],
  );

  const loadContextData = useCallback(async () => {
    if (accessToken === null) {
      return;
    }

    const requestId = ++contextLoadRequestIdRef.current;
    setLoadingContext(!contextLoadedRef.current);
    try {
      const [patientResult] = await Promise.allSettled([
        patientsClient.list(accessToken, {
          sortBy: "full_name",
          sortOrder: "asc",
        }),
      ]);

      if (requestId !== contextLoadRequestIdRef.current || !isMountedRef.current) {
        throw createAgendaRequestAbortedError();
      }

      if (patientResult.status === "fulfilled") {
        // 🚀 PERFORMANCE: atualização de contexto em transição reduz re-render em cascata.
        startTransition(() => {
          setPatients(patientResult.value);
          setActivities([]);
          setForms([]);
          setContextLoaded(true);
        });
      } else {
        throw patientResult.reason;
      }
    } catch (requestError) {
      if (isAgendaRequestAbortedError(requestError)) {
        return;
      }
      setErrorMessage(
        requestError instanceof Error ? requestError.message : "Falha ao carregar dados da agenda.",
      );
    } finally {
      if (requestId === contextLoadRequestIdRef.current && isMountedRef.current) {
        setLoadingContext(false);
      }
    }
  }, [accessToken, patientsClient]);

  const loadAssignTemplates = useCallback(async () => {
    startTransition(() => {
      setActivityTemplates([]);
      setFormTemplates([]);
    });
    setLoadingTemplates(false);
  }, []);

  const loadVisibleSessions = useCallback(async () => {
    if (accessToken === null) {
      return;
    }

    const requestId = ++calendarLoadRequestIdRef.current;
    setLoadingCalendar(!calendarLoadedRef.current);
    try {
      if (scope !== "year") {
        await refreshMonthSessions(focusedMonth);
      } else {
        const year = focusedMonth.getFullYear();
        const monthDates = Array.from({ length: 12 }, (_, monthIndex) => new Date(year, monthIndex, 1));
        const responses = await Promise.all(
          monthDates.map(async (monthDate) => ({
            monthKey: toMonthKey(monthDate),
            sessions: await apiClient.listAgenda(accessToken, {
              view: "month",
              referenceDate: toDateKeyFromDate(monthDate),
            }),
              })),
        );

        if (requestId !== calendarLoadRequestIdRef.current || !isMountedRef.current) {
          throw createAgendaRequestAbortedError();
        }

        // 🚀 PERFORMANCE: merge anual de meses aplicado em transição para preservar responsividade da UI.
        startTransition(() => {
          setSessionsByMonth((current) => {
            const next = { ...current };
            for (const response of responses) {
              next[response.monthKey] = response.sessions;
            }
            return next;
          });
        });
      }
      startTransition(() => {
        setCalendarLoaded(true);
      });
    } catch (requestError) {
      if (isAgendaRequestAbortedError(requestError)) {
        return;
      }
      setErrorMessage(
        requestError instanceof Error ? requestError.message : "Falha ao sincronizar visualizacao da agenda.",
      );
    } finally {
      if (requestId === calendarLoadRequestIdRef.current && isMountedRef.current) {
        setLoadingCalendar(false);
      }
    }
  }, [accessToken, apiClient, focusedMonth, refreshMonthSessions, scope]);

  useEffect(() => {
    void loadContextData();
    void loadAssignTemplates();
  }, [loadAssignTemplates, loadContextData]);

  useEffect(() => {
    void loadVisibleSessions();
  }, [loadVisibleSessions]);

  useEffect(() => {
    if (latestNotification === null || latestNotification.eventType === null || latestNotification.eventType === undefined) {
      return;
    }
    if (!REALTIME_REFRESH_EVENTS.has(latestNotification.eventType)) {
      return;
    }
    if (lastHandledRealtimeNotificationIdRef.current === latestNotification.id) {
      return;
    }

    lastHandledRealtimeNotificationIdRef.current = latestNotification.id;
    void Promise.all([
      loadContextData(),
      refreshMonthSessions(monthScopeFromDateKey(selectedDateKey)),
    ]).catch((requestError) => {
      setErrorMessage(
        resolveAsyncErrorMessage(requestError, "Falha ao sincronizar atualizacao em tempo real da agenda."),
      );
    });
  }, [latestNotification, loadContextData, refreshMonthSessions, selectedDateKey]);

  useEffect(() => {
    agendaScreenCache = {
      patients,
      activities,
      forms,
      activityTemplates,
      formTemplates,
      sessionsByMonth,
      scope,
      mode,
      focusedMonthDateKey: toDateKeyFromDate(startOfMonth(focusedMonth)),
      selectedDateKey,
      contextLoaded,
      calendarLoaded,
    };
  }, [
    activities,
    activityTemplates,
    calendarLoaded,
    contextLoaded,
    focusedMonth,
    forms,
    formTemplates,
    mode,
    patients,
    scope,
    selectedDateKey,
    sessionsByMonth,
  ]);

  useEffect(() => {
    const requestId = ++eventsComputationRequestIdRef.current;

    const compute = async () => {
      const buckets = await computeEventsByDateOnRuntime(sessionsByMonth, activities, forms);
      if (requestId !== eventsComputationRequestIdRef.current || !isMountedRef.current) {
        return;
      }

      // 🚀 PERFORMANCE: mapa final de eventos aplicado em transição para evitar custo de agregação dentro do render.
      startTransition(() => {
        setEventsByDate(mapBucketsToMap(buckets));
      });
    };

    void compute();
  }, [activities, computeEventsByDateOnRuntime, forms, sessionsByMonth]);

  const handleFocusedMonthChange = useCallback(
    (monthDate: Date) => {
      const normalizedMonth = startOfMonth(monthDate);
      setFocusedMonth(normalizedMonth);
      setSelectedDateKey((current) => normalizeSelectedDateForMonth(current, normalizedMonth));
      setErrorMessage(null);
    },
    [setFocusedMonth],
  );

  const handleScopeChange = useCallback(
    (nextScope: AppleCalendarScope) => {
      if (nextScope === "day") {
        if (scope !== "day") {
          previousScopeBeforeDayRef.current = scope;
          previousModeBeforeDayRef.current = mode;
        }
        setMode("list");
        setScope("day");
        setErrorMessage(null);
        return;
      }

      setScope(nextScope);
      if (nextScope === "month") {
        // 🚀 PERFORMANCE: remove modo compacto e garante entrada em Lista ao sair da visão anual.
        setMode("list");
        setSelectedDateKey((current) => normalizeSelectedDateForMonth(current, focusedMonth));
      }
      setErrorMessage(null);
    },
    [focusedMonth, mode, scope],
  );

  const handleToggleScope = useCallback(() => {
    setScope((current) => {
      if (current === "day") {
        const previousScope =
          previousScopeBeforeDayRef.current === "day" ? "month" : previousScopeBeforeDayRef.current;
        setMode(previousModeBeforeDayRef.current);
        if (previousScope === "month") {
          setSelectedDateKey((dateKey) => normalizeSelectedDateForMonth(dateKey, focusedMonth));
        }
        return previousScope;
      }

      const next = current === "year" ? "month" : "year";
      if (next === "month") {
        // 🚀 PERFORMANCE: alternância de escopo sempre entra em Lista para evitar fallback de layout legado.
        setMode("list");
        setSelectedDateKey((dateKey) => normalizeSelectedDateForMonth(dateKey, focusedMonth));
      }
      return next;
    });
    setErrorMessage(null);
  }, [focusedMonth]);

  const handleSelectDate = useCallback((dateKey: string) => {
    setSelectedDateKey(dateKey);
    const targetMonth = monthScopeFromDateKey(dateKey);
    // 🚀 PERFORMANCE: evita atualizar focusedMonth quando o mês não mudou (previne re-render global e reload desnecessário).
    setFocusedMonth((current) => {
      if (
        current.getFullYear() === targetMonth.getFullYear() &&
        current.getMonth() === targetMonth.getMonth()
      ) {
        return current;
      }
      return targetMonth;
    });
  }, []);

  const handleOpenDayView = useCallback(
    (dateKey: string) => {
      handleSelectDate(dateKey);
      if (scope !== "day") {
        previousScopeBeforeDayRef.current = scope;
        previousModeBeforeDayRef.current = mode;
      }
      setMode("list");
      setScope("day");
      setErrorMessage(null);
    },
    [handleSelectDate, mode, scope],
  );

  const handleExitDayView = useCallback(() => {
    const previousScope =
      previousScopeBeforeDayRef.current === "day" ? "month" : previousScopeBeforeDayRef.current;
    setMode(previousModeBeforeDayRef.current);
    setScope(previousScope);
    setErrorMessage(null);
  }, []);

  const handleJumpToToday = useCallback(() => {
    const now = new Date();
    setSelectedDateKey(toDateKeyFromDate(now));
    setFocusedMonth(startOfMonth(now));
    setErrorMessage(null);
    setInfoMessage(null);
  }, []);

  const handlePrevPeriod = useCallback(() => {
    if (scope === "year") {
      setFocusedMonth((current) => startOfMonth(new Date(current.getFullYear() - 1, 0, 1)));
      setSelectedDateKey((dateKey) => {
        const selected = fromDateKey(dateKey);
        return toDateKeyFromDate(new Date(selected.getFullYear() - 1, selected.getMonth(), selected.getDate()));
      });
      return;
    }
    handleFocusedMonthChange(addMonths(focusedMonth, -1));
  }, [focusedMonth, handleFocusedMonthChange, scope]);

  const handleNextPeriod = useCallback(() => {
    if (scope === "year") {
      setFocusedMonth((current) => startOfMonth(new Date(current.getFullYear() + 1, 0, 1)));
      setSelectedDateKey((dateKey) => {
        const selected = fromDateKey(dateKey);
        return toDateKeyFromDate(new Date(selected.getFullYear() + 1, selected.getMonth(), selected.getDate()));
      });
      return;
    }
    handleFocusedMonthChange(addMonths(focusedMonth, 1));
  }, [focusedMonth, handleFocusedMonthChange, scope]);

  const openCreateSheet = useCallback(() => {
    setCreateSheetVisible(true);
    setErrorMessage(null);
    setFlowStatusByMode(INITIAL_FLOW_STATUS);
    setFlowErrorsByMode(INITIAL_FLOW_ERRORS);
    // 🚀 PERFORMANCE: evita recarregar contexto/templates sem necessidade ao abrir o sheet.
    if (!contextLoadedRef.current) {
      void loadContextData();
    }
  }, [loadContextData]);

  const handleRescheduleSessionFromDayView = useCallback(
    async (sessionId: string, nextStartAtIso: string, nextEndAtIso: string): Promise<boolean> => {
      if (accessToken === null) {
        setErrorMessage("Sessao expirada. Entre novamente.");
        return false;
      }

      try {
        const updatedSession = await apiClient.applySessionAction(accessToken, sessionId, {
          action: "reschedule",
          scheduledStartAt: nextStartAtIso,
          scheduledEndAt: nextEndAtIso,
        });

        setSessionsByMonth((current) => upsertSessionIntoMonth(current, updatedSession));
        setInfoMessage("Sessao reagendada com sucesso.");
        setErrorMessage(null);
        return true;
      } catch (requestError) {
        setErrorMessage(
          resolveAsyncErrorMessage(
            requestError,
            "Falha ao reagendar sessao na visualizacao por dia.",
          ),
        );
        return false;
      }
    },
    [accessToken, apiClient],
  );

  const handleAssignSession = useCallback(
    async (draft: AssignSessionDraft) => {
      if (accessToken === null) {
        const message = "Sessao expirada. Entre novamente.";
        updateFlowState("session", "error", message);
        return { ok: false, message };
      }

      const startAt = combineDateAndTime(draft.dateKey, draft.startTime);
      const endAt = combineDateAndTime(draft.dateKey, draft.endTime);
      if (startAt === null || endAt === null) {
        const message = "Formato de data/horario invalido para a sessao.";
        updateFlowState("session", "error", message);
        return { ok: false, message };
      }

      updateFlowState("session", "loading");
      setInfoMessage(null);
      try {
        const createdSession = await apiClient.createSession(accessToken, {
          patientId: draft.patientId,
          scheduledStartAt: startAt,
          scheduledEndAt: endAt,
          locationMode: "online",
          notes: draft.notes.trim().length > 0 ? draft.notes.trim() : undefined,
        });

        setSessionsByMonth((current) => upsertSessionIntoMonth(current, createdSession));
        updateFlowState("session", "success");
        const message = "Sessao atribuida com sucesso.";
        setInfoMessage(message);

        void Promise.all([
          refreshMonthSessions(monthScopeFromDateKey(draft.dateKey)),
          loadContextData(),
        ]).catch((requestError) => {
          setErrorMessage(
            resolveAsyncErrorMessage(requestError, "Falha ao sincronizar dados apos atribuir sessao."),
          );
        });

        return { ok: true, message };
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : "Falha ao atribuir sessao na agenda.";
        updateFlowState(
          "session",
          "error",
          message,
        );
        return { ok: false, message };
      } finally {
        setFlowStatusByMode((current) => ({
          ...current,
          session: current.session === "success" ? "success" : "idle",
        }));
      }
    },
    [accessToken, apiClient, loadContextData, refreshMonthSessions, updateFlowState],
  );

  const handleAssignActivity = useCallback(
    async (_draft: AssignActivityDraft) => {
      const message =
        "Fluxo legado de atividades foi removido. Vamos reconstruir no novo modulo de documentos.";
      updateFlowState("activity", "error", message);
      return { ok: false, message };
    },
    [updateFlowState],
  );

  const handleAssignForm = useCallback(
    async (_draft: AssignFormDraft) => {
      const message =
        "Fluxo legado de formularios foi removido. Vamos reconstruir no novo modulo de documentos.";
      updateFlowState("form", "error", message);
      return { ok: false, message };
    },
    [updateFlowState],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: "Agenda Clinica",
      headerRight: () => (
        <AgendaHeaderActions
          scope={scope}
          mode={mode}
          onToday={handleJumpToToday}
          onOpenCreate={openCreateSheet}
          onOpenDayView={() => handleOpenDayView(selectedDateKey)}
          onToggleScope={handleToggleScope}
          onPrev={handlePrevPeriod}
          onNext={handleNextPeriod}
          onModeChange={setMode}
        />
      ),
    });
  }, [
    handleJumpToToday,
    handleNextPeriod,
    handleOpenDayView,
    handlePrevPeriod,
    handleToggleScope,
    mode,
    navigation,
    openCreateSheet,
    selectedDateKey,
    scope,
  ]);

  return (
    <ScreenFadeIn style={styles.screen}>
      <View style={[shellStyles.viewContainer, styles.container]}>
        <AppleAgendaCalendar
          loading={loading}
          loadingLabel="Sincronizando agenda..."
          statusLabel={statusLabel}
          infoMessage={infoMessage}
          errorMessage={normalizedErrorMessage}
          scope={scope}
          mode={mode}
          selectedDateKey={selectedDateKey}
          todayDateKey={todayDateKey}
          focusedMonth={focusedMonth}
          eventsByDate={eventsByDate}
          onScopeChange={handleScopeChange}
          onSelectDate={handleSelectDate}
          onOpenDayView={handleOpenDayView}
          onExitDayView={handleExitDayView}
          onRescheduleSession={handleRescheduleSessionFromDayView}
          onFocusedMonthChange={handleFocusedMonthChange}
        />
      </View>

      <AgendaAssignSheet
        visible={createSheetVisible}
        selectedDateKey={selectedDateKey}
        enableUnifiedFlow={false}
        patients={patients}
        activityTemplates={activityTemplates}
        formTemplates={formTemplates}
        loadingTemplates={loadingTemplates}
        flowStatusByMode={flowStatusByMode}
        errorMessageByMode={flowErrorsByMode}
        onClose={() => setCreateSheetVisible(false)}
        onAssignSession={handleAssignSession}
        onAssignActivity={handleAssignActivity}
        onAssignForm={handleAssignForm}
        onOpenActivitiesTemplates={() => {
          setCreateSheetVisible(false);
          router.push(psychologistRoutes.activities);
        }}
        onOpenFormTemplates={() => {
          setCreateSheetVisible(false);
          router.push(psychologistRoutes.forms);
        }}
      />
    </ScreenFadeIn>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    paddingTop: 10,
    backgroundColor: "transparent",
  },
});
