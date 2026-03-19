import { useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

function createIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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

  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [forms, setForms] = useState<ClinicalFormListItem[]>([]);
  const [activityTemplates, setActivityTemplates] = useState<ActivityTemplateListItem[]>([]);
  const [formTemplates, setFormTemplates] = useState<FormTemplateListItem[]>([]);
  const [sessionsByMonth, setSessionsByMonth] = useState<Record<string, SessionAgendaItem[]>>({});

  const [scope, setScope] = useState<AppleCalendarScope>("year");
  const [mode, setMode] = useState<AppleCalendarMode>("compact");

  const [focusedMonth, setFocusedMonth] = useState(startOfMonth(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState(toDateKeyFromDate(new Date()));

  const [loadingContext, setLoadingContext] = useState(false);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [createSheetVisible, setCreateSheetVisible] = useState(false);

  const [flowStatusByMode, setFlowStatusByMode] =
    useState<Record<AgendaAssignMode, AgendaAssignFlowStatus>>(INITIAL_FLOW_STATUS);
  const [flowErrorsByMode, setFlowErrorsByMode] =
    useState<Partial<Record<AgendaAssignMode, string | null>>>(INITIAL_FLOW_ERRORS);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const todayDateKey = useMemo(() => toDateKeyFromDate(new Date()), []);

  const loading = loadingContext || loadingCalendar;

  const statusLabel = useMemo(
    () =>
      scope === "year"
        ? `Ano ${focusedMonth.getFullYear()}`
        : `${monthLabel(focusedMonth)} ${focusedMonth.getFullYear()}`,
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
      setSessionsByMonth((current) => ({
        ...current,
        [monthKey]: response,
      }));
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
    setLoadingContext(true);
    try {
      const [patientResult, activityResult, formResult] = await Promise.allSettled([
        patientsClient.list(accessToken, {
          sortBy: "full_name",
          sortOrder: "asc",
        }),
        activitiesClient.listActivities(accessToken, { limit: 260 }),
        formsClient.listForms(accessToken, { limit: 260 }),
      ]);

      if (patientResult.status === "fulfilled") {
        setPatients(patientResult.value);
      } else {
        throw patientResult.reason;
      }

      setActivities(activityResult.status === "fulfilled" ? activityResult.value : []);
      setForms(formResult.status === "fulfilled" ? formResult.value : []);
    } catch (requestError) {
      setErrorMessage(
        requestError instanceof Error ? requestError.message : "Falha ao carregar dados da agenda.",
      );
    } finally {
      setLoadingContext(false);
    }
  }, [accessToken, activitiesClient, formsClient, patientsClient]);

  const loadAssignTemplates = useCallback(async () => {
    if (accessToken === null) {
      return;
    }
    setLoadingTemplates(true);
    try {
      const [activityTemplateResult, formTemplateResult] = await Promise.allSettled([
        activityTemplatesClient.listTemplates(accessToken, { limit: 200 }),
        formTemplatesClient.listTemplates(accessToken, { limit: 200 }),
      ]);

      setActivityTemplates(
        activityTemplateResult.status === "fulfilled" ? activityTemplateResult.value : [],
      );
      setFormTemplates(formTemplateResult.status === "fulfilled" ? formTemplateResult.value : []);

      if (
        activityTemplateResult.status === "rejected" &&
        formTemplateResult.status === "rejected"
      ) {
        throw activityTemplateResult.reason;
      }
    } catch (requestError) {
      setErrorMessage(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao carregar templates para atribuicao.",
      );
    } finally {
      setLoadingTemplates(false);
    }
  }, [accessToken, activityTemplatesClient, formTemplatesClient]);

  const loadVisibleSessions = useCallback(async () => {
    if (accessToken === null) {
      return;
    }

    setLoadingCalendar(true);
    try {
      if (scope === "month") {
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

        setSessionsByMonth((current) => {
          const next = { ...current };
          for (const response of responses) {
            next[response.monthKey] = response.sessions;
          }
          return next;
        });
      }
    } catch (requestError) {
      setErrorMessage(
        requestError instanceof Error ? requestError.message : "Falha ao sincronizar visualizacao da agenda.",
      );
    } finally {
      setLoadingCalendar(false);
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
    void loadContextData();
    void refreshMonthSessions(monthScopeFromDateKey(selectedDateKey));
  }, [latestNotification, loadContextData, refreshMonthSessions, selectedDateKey]);

  const sessionEvents = useMemo<AgendaCalendarEvent[]>(() => {
    return Object.values(sessionsByMonth)
      .flat()
      .map((session) => ({
        id: session.id,
        title: session.patientName,
        startsAt: session.scheduledStartAt,
        endsAt: session.scheduledEndAt,
        type: "session",
        color: sessionColor(session.status),
        patientName: session.patientName,
      }));
  }, [sessionsByMonth]);

  const activityEvents = useMemo<AgendaCalendarEvent[]>(
    () =>
      activities.map((activity) => {
        const eventDate = resolveActivityDate(activity);
        return {
          id: activity.id,
          title: activity.title,
          startsAt: eventDate,
          endsAt: eventDate,
          type: "activity",
          color: activity.status === "scheduled" ? "#C688DD" : "#D89AE8",
          patientName: activity.patientName,
        };
      }),
    [activities],
  );

  const formEvents = useMemo<AgendaCalendarEvent[]>(() => {
    const events: AgendaCalendarEvent[] = [];
    for (const form of forms) {
      const formDate = resolveFormDate(form);
      if (formDate === null) {
        continue;
      }
      events.push({
        id: form.id,
        title: form.title,
        startsAt: formDate,
        endsAt: formDate,
        type: "form",
        color: "#9D7FEA",
        patientName: form.patientName,
      });
    }
    return events;
  }, [forms]);

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, AgendaCalendarEvent[]>();

    for (const event of [...sessionEvents, ...activityEvents, ...formEvents]) {
      const dateKey = toDateKeyFromIso(event.startsAt);
      const bucket = grouped.get(dateKey);
      if (bucket) {
        bucket.push(event);
      } else {
        grouped.set(dateKey, [event]);
      }
    }

    for (const [dateKey, events] of grouped.entries()) {
      grouped.set(
        dateKey,
        [...events].sort(
          (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
        ),
      );
    }
    return grouped;
  }, [activityEvents, formEvents, sessionEvents]);

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
      setScope(nextScope);
      if (nextScope === "month") {
        setSelectedDateKey((current) => normalizeSelectedDateForMonth(current, focusedMonth));
      }
      setErrorMessage(null);
    },
    [focusedMonth],
  );

  const handleToggleScope = useCallback(() => {
    setScope((current) => {
      const next = current === "year" ? "month" : "year";
      if (next === "month") {
        setSelectedDateKey((dateKey) => normalizeSelectedDateForMonth(dateKey, focusedMonth));
      }
      return next;
    });
    setErrorMessage(null);
  }, [focusedMonth]);

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
    void loadAssignTemplates();
  }, [loadAssignTemplates]);

  const handleAssignSession = useCallback(
    async (draft: AssignSessionDraft) => {
      if (accessToken === null) {
        updateFlowState("session", "error", "Sessao expirada. Entre novamente.");
        return;
      }

      const startAt = combineDateAndTime(draft.dateKey, draft.startTime);
      const endAt = combineDateAndTime(draft.dateKey, draft.endTime);
      if (startAt === null || endAt === null) {
        updateFlowState("session", "error", "Formato de data/horario invalido para a sessao.");
        return;
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
        setCreateSheetVisible(false);
        updateFlowState("session", "success");
        setInfoMessage("Sessao atribuida com sucesso.");

        void Promise.all([
          refreshMonthSessions(monthScopeFromDateKey(draft.dateKey)),
          loadContextData(),
        ]);
      } catch (requestError) {
        updateFlowState(
          "session",
          "error",
          requestError instanceof Error ? requestError.message : "Falha ao atribuir sessao na agenda.",
        );
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
    async (draft: AssignActivityDraft) => {
      if (accessToken === null) {
        updateFlowState("activity", "error", "Sessao expirada. Entre novamente.");
        return;
      }

      const dueAt = combineDateAndTime(draft.dueDateKey, draft.dueTime);
      if (dueAt === null) {
        updateFlowState("activity", "error", "Prazo invalido para atribuicao da atividade.");
        return;
      }

      const scheduledSendAt =
        draft.sendMode === "scheduled"
          ? combineDateAndTime(draft.scheduledDateKey, draft.scheduledTime)
          : undefined;
      if (draft.sendMode === "scheduled" && scheduledSendAt === null) {
        updateFlowState("activity", "error", "Envio agendado invalido para atividade.");
        return;
      }

      const overrideTitle = draft.overrideTitle.trim();
      const overrideDescription = draft.overrideDescription.trim();
      const overrideInstructions = draft.overrideInstructions.trim();

      updateFlowState("activity", "loading");
      setInfoMessage(null);
      try {
        const result = await activityTemplatesClient.assignTemplate(
          accessToken,
          draft.templateId,
          {
            patientId: draft.patientId,
            sendMode: draft.sendMode,
            dueAt,
            scheduledSendAt: scheduledSendAt ?? undefined,
            overrides:
              overrideTitle.length > 0 ||
              overrideDescription.length > 0 ||
              overrideInstructions.length > 0
                ? {
                    title: overrideTitle.length > 0 ? overrideTitle : undefined,
                    description: overrideDescription.length > 0 ? overrideDescription : undefined,
                    instructions: overrideInstructions.length > 0 ? overrideInstructions : undefined,
                  }
                : undefined,
          },
          createIdempotencyKey("agenda-activity"),
        );

        setActivities((current) => upsertById(current, mapActivityDetailToItem(result.activity)));
        setCreateSheetVisible(false);
        updateFlowState("activity", "success");
        setInfoMessage(
          draft.sendMode === "scheduled"
            ? "Atividade agendada para envio com sucesso."
            : "Atividade atribuida com sucesso.",
        );

        const monthsToRefresh = [draft.dueDateKey];
        if (draft.sendMode === "scheduled") {
          monthsToRefresh.push(draft.scheduledDateKey);
        }

        void Promise.all([refreshMonthsForDateKeys(monthsToRefresh), loadContextData()]);
      } catch (requestError) {
        updateFlowState(
          "activity",
          "error",
          requestError instanceof Error ? requestError.message : "Falha ao atribuir atividade.",
        );
      } finally {
        setFlowStatusByMode((current) => ({
          ...current,
          activity: current.activity === "success" ? "success" : "idle",
        }));
      }
    },
    [
      accessToken,
      activityTemplatesClient,
      loadContextData,
      refreshMonthsForDateKeys,
      updateFlowState,
    ],
  );

  const handleAssignForm = useCallback(
    async (draft: AssignFormDraft) => {
      if (accessToken === null) {
        updateFlowState("form", "error", "Sessao expirada. Entre novamente.");
        return;
      }

      const scheduledSendAt =
        draft.sendMode === "scheduled"
          ? combineDateAndTime(draft.scheduledDateKey, draft.scheduledTime)
          : undefined;
      if (draft.sendMode === "scheduled" && scheduledSendAt === null) {
        updateFlowState("form", "error", "Envio agendado invalido para formulario.");
        return;
      }

      const overrideTitle = draft.overrideTitle.trim();
      const overrideSubtitle = draft.overrideSubtitle.trim();

      updateFlowState("form", "loading");
      setInfoMessage(null);
      try {
        const result = await formTemplatesClient.assignTemplate(
          accessToken,
          draft.templateId,
          {
            patientId: draft.patientId,
            sendMode: draft.sendMode,
            scheduledSendAt: scheduledSendAt ?? undefined,
            overrides:
              overrideTitle.length > 0 || overrideSubtitle.length > 0
                ? {
                    title: overrideTitle.length > 0 ? overrideTitle : undefined,
                    subtitle: overrideSubtitle.length > 0 ? overrideSubtitle : undefined,
                  }
                : undefined,
          },
          createIdempotencyKey("agenda-form"),
        );

        setForms((current) => upsertById(current, mapFormDetailToItem(result.form)));
        setCreateSheetVisible(false);
        updateFlowState("form", "success");
        setInfoMessage(
          draft.sendMode === "scheduled"
            ? "Formulario agendado para envio com sucesso."
            : "Formulario atribuido com sucesso.",
        );

        const monthsToRefresh =
          draft.sendMode === "scheduled" ? [draft.scheduledDateKey] : [selectedDateKey];

        void Promise.all([refreshMonthsForDateKeys(monthsToRefresh), loadContextData()]);
      } catch (requestError) {
        updateFlowState(
          "form",
          "error",
          requestError instanceof Error ? requestError.message : "Falha ao atribuir formulario.",
        );
      } finally {
        setFlowStatusByMode((current) => ({
          ...current,
          form: current.form === "success" ? "success" : "idle",
        }));
      }
    },
    [
      accessToken,
      formTemplatesClient,
      loadContextData,
      refreshMonthsForDateKeys,
      selectedDateKey,
      updateFlowState,
    ],
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
    handlePrevPeriod,
    handleToggleScope,
    mode,
    navigation,
    openCreateSheet,
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
          onSelectDate={(dateKey) => {
            setSelectedDateKey(dateKey);
            setFocusedMonth(monthScopeFromDateKey(dateKey));
          }}
          onFocusedMonthChange={handleFocusedMonthChange}
        />
      </View>

      <AgendaAssignSheet
        visible={createSheetVisible}
        selectedDateKey={selectedDateKey}
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
    backgroundColor: "#F4F6FA",
  },
});
