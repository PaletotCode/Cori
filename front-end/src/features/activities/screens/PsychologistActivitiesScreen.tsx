import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import {
  startTransition,
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { shellStyles } from "../../../shared/ui/shellStyles";
import { typographyContract } from "../../../shared/ui/typography";
import { useNotificationsStore } from "../../notifications/hooks/useNotificationsStore";
import { useAuthStore } from "../../auth/hooks/useAuthStore";
import { authStore } from "../../auth/store/authStore";
import {
  createPatientsApiClient,
  type PatientsApiClient,
} from "../../patients/api/patientsApiClient";
import type { PatientListItem } from "../../patients/api/types";
import {
  ActivityTemplatesApiError,
  createActivityTemplatesApiClient,
  type ActivityTemplatesApiClient,
} from "../api/activityTemplatesApiClient";
import type {
  ActivityRecurrenceRule,
  ActivityTemplateAssignPayload,
  ActivityTemplateCreatePayload,
  ActivityTemplateListItem,
  ActivityType,
  TemplateSendMode,
} from "../api/types";
import type { ActivitiesApiClient } from "../api/activitiesApiClient";

type WorkspaceIntent = "activity" | "document";
type ComposerStep =
  | "intent"
  | "title"
  | "description"
  | "instructions"
  | "resource"
  | "patient"
  | "due"
  | "recurrence"
  | "send"
  | "confirm"
  | "result";

type SubmitState = "idle" | "loading" | "success" | "queued" | "error";

type QueueOperationKind = "create_and_assign" | "update_and_assign";
type IconName = ComponentProps<typeof Ionicons>["name"];

interface ActivitiesComposerDraft {
  intent: WorkspaceIntent;
  activityType: ActivityType;
  title: string;
  description: string;
  instructions: string;
  resourceUrl: string;
  patientId: string;
  dueEnabled: boolean;
  dueDateKey: string;
  dueTime: string;
  recurrenceRule: ActivityRecurrenceRule;
  recurrenceInterval: string;
  recurrenceEndDateKey: string;
  recurrenceWeekdays: number[];
  sendMode: TemplateSendMode;
  scheduledDateKey: string;
  scheduledTime: string;
  additionalNote: string;
}

interface ComposerPersistencePayload {
  isComposerVisible: boolean;
  currentStep: ComposerStep;
  editingTemplateId: string | null;
  draft: ActivitiesComposerDraft;
}

interface PendingQueueItem {
  id: string;
  createdAt: string;
  kind: QueueOperationKind;
  templateId: string | null;
  templatePayload: ActivityTemplateCreatePayload;
  assignPayload: ActivityTemplateAssignPayload;
  idempotencyKey: string;
}

interface ComposerErrors {
  intent?: string;
  title?: string;
  resourceUrl?: string;
  patientId?: string;
  dueDateKey?: string;
  dueTime?: string;
  recurrenceInterval?: string;
  scheduledDateKey?: string;
  scheduledTime?: string;
}

interface PsychologistActivitiesScreenProps {
  templatesClient?: ActivityTemplatesApiClient;
  patientsClient?: PatientsApiClient;
  apiClient?: ActivitiesApiClient;
}

interface SubmitFeedback {
  status: SubmitState;
  title: string;
  message: string;
}

const templatesApiClient = createActivityTemplatesApiClient();
const patientsApiClient = createPatientsApiClient();

const COMPOSER_STORAGE_KEY = "cori:activities:composer:v1";
const QUEUE_STORAGE_KEY = "cori:activities:queue:v1";

const REALTIME_WORKSPACE_EVENTS = new Set<string>([
  "activity_assigned",
  "activity_resend",
  "activity_cancel",
  "activity_reopen",
  "activity_complete",
  "activity_start",
]);

const COMPOSER_STEPS: ComposerStep[] = [
  "intent",
  "title",
  "description",
  "instructions",
  "resource",
  "patient",
  "due",
  "recurrence",
  "send",
  "confirm",
];

const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
];

const ACTIVITY_TYPE_OPTIONS: Array<{
  value: ActivityType;
  label: string;
  iconName: IconName;
  description: string;
}> = [
  {
    value: "simple_task",
    label: "Tarefa simples",
    iconName: "checkmark-done-outline",
    description: "Atividade pontual com objetivo claro.",
  },
  {
    value: "guided_meditation",
    label: "Meditacao guiada",
    iconName: "leaf-outline",
    description: "Pratica guiada para respiracao e foco.",
  },
  {
    value: "habit",
    label: "Habito",
    iconName: "repeat-outline",
    description: "Rotina terapeutica com repeticao estruturada.",
  },
  {
    value: "document_reading",
    label: "Leitura/documento",
    iconName: "document-text-outline",
    description: "Leitura, material externo ou link de apoio.",
  },
];

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeKey(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function addDays(date: Date, amount: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function defaultDueDate(): Date {
  const next = addDays(new Date(), 1);
  next.setHours(18, 0, 0, 0);
  return next;
}

function defaultScheduledDate(): Date {
  const next = addDays(new Date(), 0);
  next.setMinutes(next.getMinutes() + 20);
  next.setSeconds(0, 0);
  return next;
}

function createDefaultDraft(patientId: string): ActivitiesComposerDraft {
  const due = defaultDueDate();
  const scheduled = defaultScheduledDate();

  return {
    intent: "activity",
    activityType: "simple_task",
    title: "",
    description: "",
    instructions: "",
    resourceUrl: "",
    patientId,
    dueEnabled: true,
    dueDateKey: toDateKey(due),
    dueTime: toTimeKey(due),
    recurrenceRule: "none",
    recurrenceInterval: "1",
    recurrenceEndDateKey: "",
    recurrenceWeekdays: [1, 2, 3, 4, 5],
    sendMode: "immediate",
    scheduledDateKey: toDateKey(scheduled),
    scheduledTime: toTimeKey(scheduled),
    additionalNote: "",
  };
}

function isDateKeyValid(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeValid(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);

  return Number.isFinite(hour) && Number.isFinite(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function toLocalDate(dateKey: string, timeKey: string): Date | null {
  if (!isDateKeyValid(dateKey) || !isTimeValid(timeKey)) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  const [hourRaw, minuteRaw] = timeKey.split(":");

  const parsed = new Date(
    Number.parseInt(yearRaw, 10),
    Number.parseInt(monthRaw, 10) - 1,
    Number.parseInt(dayRaw, 10),
    Number.parseInt(hourRaw, 10),
    Number.parseInt(minuteRaw, 10),
    0,
    0,
  );

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function toIsoFromDateAndTime(dateKey: string, timeKey: string): string | null {
  const parsed = toLocalDate(dateKey, timeKey);
  if (parsed === null) {
    return null;
  }
  return parsed.toISOString();
}

function toFriendlyDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Data invalida";
  }
  return parsed.toLocaleString("pt-BR");
}

function buildIdempotencyKey(): string {
  return `activity-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isTokenInvalidMessage(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalized = error.message.toLowerCase();
  return (
    normalized.includes("token invalido") ||
    normalized.includes("token inv\u00e1lido") ||
    normalized.includes("unauthorized")
  );
}

function isRetryableQueueError(error: unknown): boolean {
  if (error instanceof ActivityTemplatesApiError) {
    return error.statusCode >= 500;
  }
  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    return normalized.includes("network") || normalized.includes("failed to fetch");
  }

  return false;
}

function iconForTemplateType(type: ActivityType): IconName {
  const found = ACTIVITY_TYPE_OPTIONS.find((option) => option.value === type);
  return found?.iconName ?? "book-outline";
}

function labelForTemplateType(type: ActivityType): string {
  const found = ACTIVITY_TYPE_OPTIONS.find((option) => option.value === type);
  return found?.label ?? "Atividade";
}

function normalizeWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed = value
    .map((item) => (typeof item === "number" ? item : Number.parseInt(String(item), 10)))
    .filter((item) => Number.isFinite(item) && item >= 0 && item <= 6);
  return [...new Set(parsed)];
}

function normalizeQueuePayload(value: unknown): PendingQueueItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const queue: PendingQueueItem[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const raw = item as Partial<PendingQueueItem>;
    if (
      typeof raw.id !== "string" ||
      typeof raw.createdAt !== "string" ||
      (raw.kind !== "create_and_assign" && raw.kind !== "update_and_assign") ||
      typeof raw.idempotencyKey !== "string" ||
      typeof raw.templatePayload !== "object" ||
      raw.templatePayload === null ||
      typeof raw.assignPayload !== "object" ||
      raw.assignPayload === null
    ) {
      continue;
    }

    queue.push({
      id: raw.id,
      createdAt: raw.createdAt,
      kind: raw.kind,
      templateId: typeof raw.templateId === "string" ? raw.templateId : null,
      templatePayload: raw.templatePayload,
      assignPayload: raw.assignPayload,
      idempotencyKey: raw.idempotencyKey,
    });
  }

  return queue;
}

function resolveStepQuestion(step: ComposerStep): string {
  switch (step) {
    case "intent":
      return "Que atividade deseja criar agora?";
    case "title":
      return "Qual o titulo da atividade?";
    case "description":
      return "Deseja adicionar uma descricao? (opcional)";
    case "instructions":
      return "Quais instrucoes serao enviadas para o paciente?";
    case "resource":
      return "Deseja incluir documento, link ou video para apoio?";
    case "patient":
      return "Para qual paciente devemos atribuir este conteudo?";
    case "due":
      return "Quer definir um prazo para conclusao?";
    case "recurrence":
      return "Esta atividade possui recorrencia?";
    case "send":
      return "Deseja enviar agora ou agendar?";
    case "confirm":
      return "Confirma criacao, armazenamento e atribuicao?";
    case "result":
      return "Resultado do fluxo";
    default:
      return "Fluxo de criacao";
  }
}

function parseTemplateToDraft(
  template: ActivityTemplateListItem,
  patientId: string,
): ActivitiesComposerDraft {
  const due = defaultDueDate();
  const scheduled = defaultScheduledDate();
  const config = template.configuration as Record<string, unknown>;

  const savedWeekdays = normalizeWeekdays(config.recurrence_weekdays);
  const savedRecurrenceRule =
    config.recurrence_rule === "daily" || config.recurrence_rule === "weekly"
      ? (config.recurrence_rule as ActivityRecurrenceRule)
      : "none";
  const savedRecurrenceInterval =
    typeof config.recurrence_interval === "number" && config.recurrence_interval > 0
      ? String(Math.floor(config.recurrence_interval))
      : "1";

  return {
    intent: template.activityType === "document_reading" ? "document" : "activity",
    activityType: template.activityType,
    title: template.title,
    description: template.description ?? "",
    instructions: template.instructions ?? "",
    resourceUrl: template.documentUrl ?? "",
    patientId,
    dueEnabled: true,
    dueDateKey: toDateKey(due),
    dueTime: toTimeKey(due),
    recurrenceRule: savedRecurrenceRule,
    recurrenceInterval: savedRecurrenceInterval,
    recurrenceEndDateKey: "",
    recurrenceWeekdays: savedWeekdays.length > 0 ? savedWeekdays : [1, 2, 3, 4, 5],
    sendMode: "immediate",
    scheduledDateKey: toDateKey(scheduled),
    scheduledTime: toTimeKey(scheduled),
    additionalNote:
      typeof config.assignment_note_default === "string" ? config.assignment_note_default : "",
  };
}

function StepTag({ text }: { text: string }) {
  return (
    <View style={styles.stepTag}>
      <Text style={styles.stepTagText}>{text}</Text>
    </View>
  );
}

function normalizeTextSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function patientInitials(fullName: string): string {
  const tokens = fullName
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? "");
  if (tokens.length === 0) {
    return "P";
  }
  return tokens.join("");
}

function patientSummary(patient: PatientListItem): string {
  if (patient.preferredName !== null && patient.preferredName.trim().length > 0) {
    return `Nome preferido: ${patient.preferredName}`;
  }
  if (patient.phone !== null && patient.phone.trim().length > 0) {
    return `Contato: ${patient.phone}`;
  }
  if (patient.email !== null && patient.email.trim().length > 0) {
    return `Contato: ${patient.email}`;
  }
  return "Perfil pronto para atribuicao.";
}

export function PsychologistActivitiesScreen({
  templatesClient = templatesApiClient,
  patientsClient = patientsApiClient,
}: PsychologistActivitiesScreenProps) {
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null);
  const latestNotification = useNotificationsStore((state) => state.items[0] ?? null);

  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [templates, setTemplates] = useState<ActivityTemplateListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isComposerVisible, setIsComposerVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState<ComposerStep>("intent");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [composerErrors, setComposerErrors] = useState<ComposerErrors>({});
  const [submitFeedback, setSubmitFeedback] = useState<SubmitFeedback>({
    status: "idle",
    title: "",
    message: "",
  });

  const [pendingQueue, setPendingQueue] = useState<PendingQueueItem[]>([]);
  const [queueHydrated, setQueueHydrated] = useState(false);
  const [composerHydrated, setComposerHydrated] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [patientSearchText, setPatientSearchText] = useState("");

  const queueProcessingRef = useRef(false);
  const lastHandledRealtimeNotificationIdRef = useRef<string | null>(null);

  const [draft, setDraft] = useState<ActivitiesComposerDraft>(() => createDefaultDraft(""));

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
          throw new Error("Sessao expirada. Entre novamente para continuar.");
        }

        const refreshedToken = authStore.getState().tokens?.accessToken ?? null;
        if (refreshedToken === null) {
          throw new Error("Sessao expirada. Entre novamente para continuar.");
        }

        return operation(refreshedToken);
      }
    },
    [accessToken],
  );

  const loadWorkspace = useCallback(async () => {
    if (accessToken === null) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [patientsResult, templatesResult] = await Promise.all([
        runWithTokenRetry((token) => patientsClient.list(token)),
        runWithTokenRetry((token) =>
          templatesClient.listTemplates(token, {
            includeArchived: false,
            limit: 200,
            offset: 0,
          }),
        ),
      ]);

      startTransition(() => {
        setPatients(patientsResult);
        setTemplates(
          [...templatesResult].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
        );
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha ao carregar workspace.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, patientsClient, runWithTokenRetry, templatesClient]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      try {
        const [rawComposer, rawQueue] = await Promise.all([
          AsyncStorage.getItem(COMPOSER_STORAGE_KEY),
          AsyncStorage.getItem(QUEUE_STORAGE_KEY),
        ]);

        if (!mounted) {
          return;
        }

        if (rawComposer !== null) {
          const parsed = JSON.parse(rawComposer) as Partial<ComposerPersistencePayload>;
          if (typeof parsed === "object" && parsed !== null) {
            if (parsed.draft) {
              setDraft(parsed.draft);
            }
            if (parsed.currentStep) {
              setCurrentStep(parsed.currentStep);
            }
            if (typeof parsed.isComposerVisible === "boolean") {
              setIsComposerVisible(parsed.isComposerVisible);
            }
            if (typeof parsed.editingTemplateId === "string") {
              setEditingTemplateId(parsed.editingTemplateId);
            }
          }
        }

        if (rawQueue !== null) {
          const parsedQueue = normalizeQueuePayload(JSON.parse(rawQueue));
          setPendingQueue(parsedQueue);
        }
      } catch {
        // noop: fallback para estado inicial
      } finally {
        if (mounted) {
          setComposerHydrated(true);
          setQueueHydrated(true);
        }
      }
    };

    void hydrate();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!composerHydrated) {
      return;
    }

    const payload: ComposerPersistencePayload = {
      isComposerVisible,
      currentStep,
      editingTemplateId,
      draft,
    };

    void AsyncStorage.setItem(COMPOSER_STORAGE_KEY, JSON.stringify(payload));
  }, [composerHydrated, currentStep, draft, editingTemplateId, isComposerVisible]);

  useEffect(() => {
    if (!queueHydrated) {
      return;
    }
    void AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(pendingQueue));
  }, [pendingQueue, queueHydrated]);

  useEffect(() => {
    if (patients.length === 0) {
      return;
    }

    if (draft.patientId.length > 0 && patients.some((item) => item.id === draft.patientId)) {
      return;
    }

    setDraft((current) => ({ ...current, patientId: patients[0]?.id ?? "" }));
  }, [draft.patientId, patients]);

  useEffect(() => {
    if (
      latestNotification === null ||
      latestNotification.eventType === null ||
      latestNotification.eventType === undefined
    ) {
      return;
    }

    if (!REALTIME_WORKSPACE_EVENTS.has(latestNotification.eventType)) {
      return;
    }

    if (lastHandledRealtimeNotificationIdRef.current === latestNotification.id) {
      return;
    }

    lastHandledRealtimeNotificationIdRef.current = latestNotification.id;
    void loadWorkspace();
  }, [latestNotification, loadWorkspace]);

  const flushPendingQueue = useCallback(async () => {
    if (accessToken === null || pendingQueue.length === 0 || queueProcessingRef.current) {
      return;
    }

    queueProcessingRef.current = true;

    let completed = 0;
    const nextQueue: PendingQueueItem[] = [];

    for (const item of pendingQueue) {
      try {
        await runWithTokenRetry(async (token) => {
          if (item.kind === "create_and_assign") {
            const createdTemplate = await templatesClient.createTemplate(token, item.templatePayload);
            await templatesClient.assignTemplate(
              token,
              createdTemplate.id,
              item.assignPayload,
              item.idempotencyKey,
            );
            return;
          }

          if (item.templateId === null) {
            throw new Error("Item da fila sem template para atualizacao.");
          }

          await templatesClient.updateTemplate(token, item.templateId, item.templatePayload);
          await templatesClient.assignTemplate(
            token,
            item.templateId,
            item.assignPayload,
            item.idempotencyKey,
          );
        });

        completed += 1;
      } catch (requestError) {
        if (isRetryableQueueError(requestError)) {
          nextQueue.push(item);
          continue;
        }

        setError(
          requestError instanceof Error
            ? `Item removido da fila: ${requestError.message}`
            : "Item removido da fila por erro invalido.",
        );
      }
    }

    if (completed > 0) {
      setInfo(`${completed} item(ns) da fila processados com sucesso.`);
      await loadWorkspace();
    }

    setPendingQueue(nextQueue);
    queueProcessingRef.current = false;
  }, [accessToken, loadWorkspace, pendingQueue, runWithTokenRetry, templatesClient]);

  useEffect(() => {
    void flushPendingQueue();
  }, [flushPendingQueue]);

  const stepIndex = useMemo(() => {
    const index = COMPOSER_STEPS.indexOf(currentStep);
    if (index < 0) {
      return 1;
    }
    return index + 1;
  }, [currentStep]);

  const totalSteps = COMPOSER_STEPS.length;

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === editingTemplateId) ?? null,
    [editingTemplateId, templates],
  );

  const filteredPatients = useMemo(() => {
    const query = normalizeTextSearch(patientSearchText);
    if (query.length === 0) {
      return patients;
    }

    return patients.filter((patient) => {
      const candidates = [
        patient.fullName,
        patient.preferredName ?? "",
        patient.email ?? "",
        patient.phone ?? "",
      ];
      return candidates.some((candidate) => normalizeTextSearch(candidate).includes(query));
    });
  }, [patientSearchText, patients]);

  const openNewComposer = useCallback(() => {
    const firstPatientId = patients[0]?.id ?? draft.patientId;
    setEditingTemplateId(null);
    setComposerErrors({});
    setSubmitFeedback({ status: "idle", title: "", message: "" });
    setPatientSearchText("");
    setDraft(createDefaultDraft(firstPatientId));
    setCurrentStep("intent");
    setIsComposerVisible(true);
    setInfo(null);
    setError(null);
  }, [draft.patientId, patients]);

  const openTemplateComposer = useCallback(
    (template: ActivityTemplateListItem) => {
      const firstPatientId = patients[0]?.id ?? draft.patientId;
      setDraft(parseTemplateToDraft(template, firstPatientId));
      setEditingTemplateId(template.id);
      setCurrentStep("title");
      setComposerErrors({});
      setSubmitFeedback({ status: "idle", title: "", message: "" });
      setPatientSearchText("");
      setIsComposerVisible(true);
      setInfo(`Template "${template.title}" pronto para ajuste e atribuicao.`);
      setError(null);
    },
    [draft.patientId, patients],
  );

  const closeComposer = useCallback(() => {
    setIsComposerVisible(false);
    setComposerErrors({});
    setPatientSearchText("");
  }, []);

  const updateDraft = useCallback(
    <TKey extends keyof ActivitiesComposerDraft>(key: TKey, value: ActivitiesComposerDraft[TKey]) => {
      setDraft((current) => ({ ...current, [key]: value }));
      setComposerErrors((current) => ({ ...current, [key]: undefined }));
    },
    [],
  );

  const toggleWeekday = useCallback((dayValue: number) => {
    setDraft((current) => {
      const exists = current.recurrenceWeekdays.includes(dayValue);
      if (exists) {
        return {
          ...current,
          recurrenceWeekdays: current.recurrenceWeekdays.filter((item) => item !== dayValue),
        };
      }
      return {
        ...current,
        recurrenceWeekdays: [...current.recurrenceWeekdays, dayValue].sort((a, b) => a - b),
      };
    });
  }, []);

  const validateStep = useCallback(
    (step: ComposerStep): boolean => {
      const nextErrors: ComposerErrors = {};

      if (step === "intent") {
        if (draft.intent !== "activity" && draft.intent !== "document") {
          nextErrors.intent = "Selecione o tipo de item para continuar.";
        }
      }

      if (step === "title") {
        if (draft.title.trim().length < 3) {
          nextErrors.title = "Titulo precisa ter ao menos 3 caracteres.";
        }
      }

      if (step === "resource" && draft.resourceUrl.trim().length > 0) {
        if (!/^https?:\/\//i.test(draft.resourceUrl.trim())) {
          nextErrors.resourceUrl = "Use um link valido iniciando com http:// ou https://.";
        }
      }

      if (step === "patient") {
        if (draft.patientId.trim().length === 0) {
          nextErrors.patientId = "Selecione um paciente antes de continuar.";
        }
      }

      if (step === "due" && draft.dueEnabled) {
        if (!isDateKeyValid(draft.dueDateKey)) {
          nextErrors.dueDateKey = "Data invalida. Use YYYY-MM-DD.";
        }
        if (!isTimeValid(draft.dueTime)) {
          nextErrors.dueTime = "Hora invalida. Use HH:mm.";
        }
      }

      if (step === "recurrence" && draft.recurrenceRule !== "none") {
        const interval = Number.parseInt(draft.recurrenceInterval, 10);
        if (!Number.isFinite(interval) || interval <= 0) {
          nextErrors.recurrenceInterval = "Intervalo precisa ser um numero maior que zero.";
        }
      }

      if (step === "send" && draft.sendMode === "scheduled") {
        if (!isDateKeyValid(draft.scheduledDateKey)) {
          nextErrors.scheduledDateKey = "Data invalida para envio agendado.";
        }
        if (!isTimeValid(draft.scheduledTime)) {
          nextErrors.scheduledTime = "Hora invalida para envio agendado.";
        }

        const scheduled = toLocalDate(draft.scheduledDateKey, draft.scheduledTime);
        if (scheduled === null || scheduled.getTime() <= Date.now()) {
          nextErrors.scheduledTime = "O envio agendado precisa estar no futuro.";
        }
      }

      setComposerErrors(nextErrors);
      return Object.keys(nextErrors).length === 0;
    },
    [draft],
  );

  const moveStep = useCallback(
    (direction: "next" | "back") => {
      if (currentStep === "result") {
        return;
      }

      const currentIndex = COMPOSER_STEPS.indexOf(currentStep);
      if (currentIndex < 0) {
        return;
      }

      if (direction === "next") {
        if (!validateStep(currentStep)) {
          return;
        }
        const nextIndex = Math.min(COMPOSER_STEPS.length - 1, currentIndex + 1);
        setCurrentStep(COMPOSER_STEPS[nextIndex]);
        return;
      }

      const previousIndex = Math.max(0, currentIndex - 1);
      setCurrentStep(COMPOSER_STEPS[previousIndex]);
    },
    [currentStep, validateStep],
  );

  const buildTemplatePayload = useCallback((): ActivityTemplateCreatePayload => {
    const activityType: ActivityType =
      draft.intent === "document" ? "document_reading" : draft.activityType;

    const recurrenceInterval = Math.max(1, Number.parseInt(draft.recurrenceInterval, 10) || 1);

    const configuration: Record<string, unknown> = {
      composer_version: "workspace_v1",
      recurrence_rule: draft.recurrenceRule,
      recurrence_interval: recurrenceInterval,
      recurrence_weekdays:
        draft.recurrenceRule === "weekly" ? draft.recurrenceWeekdays : [],
      assignment_note_default: draft.additionalNote.trim(),
    };

    return {
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      instructions: draft.instructions.trim() || undefined,
      documentUrl: draft.resourceUrl.trim() || undefined,
      configuration,
      activityType,
    };
  }, [draft]);

  const buildAssignPayload = useCallback((): ActivityTemplateAssignPayload => {
    const dueIso =
      draft.dueEnabled && isDateKeyValid(draft.dueDateKey) && isTimeValid(draft.dueTime)
        ? toIsoFromDateAndTime(draft.dueDateKey, draft.dueTime)
        : null;

    const fallbackDue = defaultDueDate().toISOString();

    const recurrenceInterval = Math.max(1, Number.parseInt(draft.recurrenceInterval, 10) || 1);

    return {
      patientId: draft.patientId,
      sendMode: draft.sendMode,
      scheduledSendAt:
        draft.sendMode === "scheduled"
          ? toIsoFromDateAndTime(draft.scheduledDateKey, draft.scheduledTime) ?? undefined
          : undefined,
      dueAt: dueIso ?? fallbackDue,
      overrides: {
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        instructions: draft.instructions.trim() || undefined,
        documentUrl: draft.resourceUrl.trim() || undefined,
        activityType: draft.intent === "document" ? "document_reading" : draft.activityType,
        recurrenceRule: draft.recurrenceRule,
        recurrenceInterval,
        recurrenceEndAt:
          draft.recurrenceEndDateKey.trim().length > 0 ? `${draft.recurrenceEndDateKey}T23:59:00.000Z` : undefined,
        configuration: {
          recurrence_weekdays:
            draft.recurrenceRule === "weekly" ? draft.recurrenceWeekdays : [],
          assignment_note_default: draft.additionalNote.trim(),
        },
      },
    };
  }, [draft]);

  const enqueueFailedOperation = useCallback(
    (item: PendingQueueItem) => {
      setPendingQueue((current) => [...current, item]);
      setSubmitFeedback({
        status: "queued",
        title: "Operacao enfileirada",
        message:
          "Sem conectividade estavel no momento. O app vai reenviar automaticamente assim que possivel.",
      });
      setInfo("Fluxo enfileirado com sucesso para envio posterior.");
    },
    [],
  );

  const submitComposer = useCallback(async () => {
    if (!validateStep("confirm")) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setInfo(null);
    setCurrentStep("result");
    setSubmitFeedback({
      status: "loading",
      title: "Processando atribuicao",
      message: "Criando item, armazenando e enviando para o paciente em tempo real.",
    });

    const templatePayload = buildTemplatePayload();
    const assignPayload = buildAssignPayload();
    const idempotencyKey = buildIdempotencyKey();

    try {
      const templateId =
        editingTemplateId === null
          ? (
              await runWithTokenRetry((token) =>
                templatesClient.createTemplate(token, templatePayload),
              )
            ).id
          : (
              await runWithTokenRetry((token) =>
                templatesClient.updateTemplate(token, editingTemplateId, templatePayload),
              )
            ).id;

      await runWithTokenRetry((token) =>
        templatesClient.assignTemplate(token, templateId, assignPayload, idempotencyKey),
      );

      await loadWorkspace();
      setSubmitFeedback({
        status: "success",
        title: "Fluxo concluido",
        message:
          "Atividade criada/atualizada, armazenada no inventario e atribuida ao paciente com sucesso.",
      });
      setEditingTemplateId(templateId);
    } catch (requestError) {
      if (isRetryableQueueError(requestError)) {
        enqueueFailedOperation({
          id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          kind: editingTemplateId === null ? "create_and_assign" : "update_and_assign",
          templateId: editingTemplateId,
          templatePayload,
          assignPayload,
          idempotencyKey,
        });
      } else {
        const message =
          requestError instanceof Error
            ? requestError.message
            : "Falha ao concluir a atribuicao.";
        setSubmitFeedback({
          status: "error",
          title: "Falha na atribuicao",
          message,
        });
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    buildAssignPayload,
    buildTemplatePayload,
    editingTemplateId,
    enqueueFailedOperation,
    loadWorkspace,
    runWithTokenRetry,
    templatesClient,
    validateStep,
  ]);

  const workspaceCards = useMemo(
    () => [
      {
        kind: "create" as const,
        id: "create-card",
      },
      ...templates.map((template) => ({
        kind: "template" as const,
        id: template.id,
        template,
      })),
    ],
    [templates],
  );

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === draft.patientId) ?? null,
    [draft.patientId, patients],
  );

  const duePreview = useMemo(() => {
    if (!draft.dueEnabled) {
      return "Prazo automatico (fallback do sistema)";
    }
    const iso = toIsoFromDateAndTime(draft.dueDateKey, draft.dueTime);
    return iso === null ? "Prazo invalido" : toFriendlyDate(iso);
  }, [draft.dueDateKey, draft.dueEnabled, draft.dueTime]);

  const sendPreview = useMemo(() => {
    if (draft.sendMode === "immediate") {
      return "Envio imediato apos concluir.";
    }
    const iso = toIsoFromDateAndTime(draft.scheduledDateKey, draft.scheduledTime);
    return iso === null ? "Agendamento invalido" : `Envio agendado para ${toFriendlyDate(iso)}.`;
  }, [draft.scheduledDateKey, draft.scheduledTime, draft.sendMode]);

  return (
    <ScrollView contentContainerStyle={[styles.container, shellStyles.scrollContainer]}>
      {!isComposerVisible ? (
        <>
          {pendingQueue.length > 0 ? (
            <View style={styles.queueBadge}>
              <Text style={styles.queueBadgeText}>Fila pendente: {pendingQueue.length}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void flushPendingQueue()}
                style={styles.queueBadgeButton}
              >
                <Text style={styles.queueBadgeButtonText}>Sincronizar agora</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Atividades</Text>
          <View style={styles.cardsGrid}>
            {workspaceCards.map((card) => {
              if (card.kind === "create") {
                return (
                  <Pressable
                    key={card.id}
                    accessibilityRole="button"
                    testID="activities-create-card"
                    onPress={openNewComposer}
                    style={[styles.workspaceCard, styles.createWorkspaceCard]}
                  >
                    <View style={styles.workspaceIconWrap}>
                      <Ionicons name="add-outline" size={20} color="#155EEF" />
                    </View>
                    <Text style={styles.createCardTitle}>Criar atividade</Text>
                    <Text style={styles.createCardSubtitle}>Nova atividade, documento ou link</Text>
                  </Pressable>
                );
              }

              const template = card.template;
              const isActive = template.id === editingTemplateId;

              return (
                <Pressable
                  key={card.id}
                  accessibilityRole="button"
                  testID={`activity-item-${template.id}`}
                  onPress={() => openTemplateComposer(template)}
                  style={[styles.workspaceCard, isActive ? styles.workspaceCardActive : null]}
                >
                  <View style={styles.workspaceIconWrap}>
                    <Ionicons
                      name={iconForTemplateType(template.activityType)}
                      size={20}
                      color="#475467"
                    />
                  </View>
                  <Text numberOfLines={2} style={styles.workspaceTitle}>
                    {template.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.workspaceMeta}>
                    {labelForTemplateType(template.activityType)}
                  </Text>
                  <Text numberOfLines={1} style={styles.workspaceMeta}>
                    Atualizado: {toFriendlyDate(template.updatedAt)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {isLoading ? <Text style={styles.loadingText}>Carregando atividades...</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {info ? <Text style={styles.infoText}>{info}</Text> : null}
        </>
      ) : (
        <>
          <View style={[styles.composerCard, styles.composerCardFullscreen]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Acoes das atividades</Text>
              <Pressable
                accessibilityRole="button"
                onPress={closeComposer}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close-outline" size={18} color="#344054" />
              </Pressable>
            </View>
            <View style={styles.metaRow}>
              <StepTag text={currentStep === "result" ? "Conclusao" : `Etapa ${stepIndex}/${totalSteps}`} />
              {currentStep === "patient" ? (
                <View style={styles.patientSearchWrap}>
                  <Ionicons name="search-outline" size={14} color="#667085" />
                  <TextInput
                    value={patientSearchText}
                    onChangeText={setPatientSearchText}
                    placeholder="Buscar paciente"
                    placeholderTextColor="#98A2B3"
                    style={styles.patientSearchInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                    testID="activities-patient-search"
                  />
                </View>
              ) : null}
            </View>

            <View style={styles.body}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollBodyContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.modalSection}>
                  <Text style={styles.stepTitle}>
                    {editingTemplateId === null ? "Criar atividade" : "Editar e atribuir"}
                  </Text>
                  <Text style={styles.stepDescription}>{resolveStepQuestion(currentStep)}</Text>
                  {currentStep === "intent" ? (
                    <>
                      <View style={styles.intentChoiceStack}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            updateDraft("intent", "activity");
                            updateDraft("activityType", "simple_task");
                          }}
                          style={[
                            styles.choiceCard,
                            draft.intent === "activity" ? styles.choiceCardActive : null,
                          ]}
                        >
                          <Text style={styles.choiceCardTitle}>Atividade terapeutica</Text>
                          <Text style={styles.choiceCardSubtitle}>Fluxo clinico com instrucoes e prazo.</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            updateDraft("intent", "document");
                            updateDraft("activityType", "document_reading");
                          }}
                          style={[
                            styles.choiceCard,
                            draft.intent === "document" ? styles.choiceCardActive : null,
                          ]}
                        >
                          <Text style={styles.choiceCardTitle}>Atribuir documento</Text>
                          <Text style={styles.choiceCardSubtitle}>Links, materiais e leitura guiada.</Text>
                        </Pressable>
                      </View>
                      {draft.intent === "activity" ? (
                        <View style={styles.activityTypeStack}>
                          {ACTIVITY_TYPE_OPTIONS.filter((option) => option.value !== "document_reading").map((option) => (
                            <Pressable
                              key={option.value}
                              accessibilityRole="button"
                              onPress={() => updateDraft("activityType", option.value)}
                              style={[
                                styles.activityTypeCard,
                                draft.activityType === option.value ? styles.activityTypeCardActive : null,
                              ]}
                            >
                              <View
                                style={[
                                  styles.activityTypeIconWrap,
                                  draft.activityType === option.value ? styles.activityTypeIconWrapActive : null,
                                ]}
                              >
                                <Ionicons
                                  name={option.iconName}
                                  size={16}
                                  color={draft.activityType === option.value ? "#0F766E" : "#667085"}
                                />
                              </View>
                              <View style={styles.activityTypeTextWrap}>
                                <Text style={styles.activityTypeTitle}>{option.label}</Text>
                                <Text style={styles.activityTypeSubtitle}>{option.description}</Text>
                              </View>
                              {draft.activityType === option.value ? (
                                <Ionicons name="checkmark-circle" size={18} color="#0F766E" />
                              ) : null}
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                      {composerErrors.intent ? <Text style={styles.errorText}>{composerErrors.intent}</Text> : null}
                    </>
                  ) : null}

                  {currentStep === "title" ? (
                    <>
                      <TextInput
                        testID="activities-form-title"
                        value={draft.title}
                        onChangeText={(value) => updateDraft("title", value)}
                        placeholder="Ex: Respiracao 4-7-8"
                        placeholderTextColor="#98A2B3"
                        style={styles.input}
                      />
                      {composerErrors.title ? <Text style={styles.errorText}>{composerErrors.title}</Text> : null}
                    </>
                  ) : null}

                  {currentStep === "description" ? (
                    <TextInput
                      value={draft.description}
                      onChangeText={(value) => updateDraft("description", value)}
                      placeholder="Contexto clinico e objetivo (opcional)"
                      placeholderTextColor="#98A2B3"
                      multiline
                      style={[styles.input, styles.multilineInput]}
                    />
                  ) : null}

                  {currentStep === "instructions" ? (
                    <TextInput
                      value={draft.instructions}
                      onChangeText={(value) => updateDraft("instructions", value)}
                      placeholder="Passo a passo do que o paciente deve executar"
                      placeholderTextColor="#98A2B3"
                      multiline
                      style={[styles.input, styles.multilineInput]}
                    />
                  ) : null}

                  {currentStep === "resource" ? (
                    <>
                      <TextInput
                        value={draft.resourceUrl}
                        onChangeText={(value) => updateDraft("resourceUrl", value)}
                        placeholder="Cole URL do documento, video ou site"
                        placeholderTextColor="#98A2B3"
                        autoCapitalize="none"
                        style={styles.input}
                      />
                      <Text style={styles.hintText}>
                        Importacao direta de arquivo local entra na proxima iteracao. Ja suporta links de apoio.
                      </Text>
                      {composerErrors.resourceUrl ? <Text style={styles.errorText}>{composerErrors.resourceUrl}</Text> : null}
                    </>
                  ) : null}

                  {currentStep === "patient" ? (
                    <>
                      <Text style={styles.helperText}>
                        Selecao individual para manter rastreabilidade e evitar atribuicoes em lote.
                      </Text>
                      {filteredPatients.length === 0 ? (
                        <Text style={styles.patientsEmptyText}>
                          Nenhum paciente encontrado para o filtro informado.
                        </Text>
                      ) : (
                        filteredPatients.map((patient) => {
                          const active = patient.id === draft.patientId;
                          return (
                            <Pressable
                              key={patient.id}
                              accessibilityRole="button"
                              testID={`activities-form-patient-${patient.id}`}
                              onPress={() => updateDraft("patientId", patient.id)}
                              style={[styles.patientCard, active ? styles.patientCardActive : null]}
                            >
                              <View style={styles.patientAvatar}>
                                <Text style={styles.patientAvatarText}>{patientInitials(patient.fullName)}</Text>
                              </View>
                              <View style={styles.patientInfo}>
                                <Text style={styles.patientName}>{patient.fullName}</Text>
                                <Text style={styles.patientMeta}>Idade: nao informada</Text>
                                <Text style={styles.patientMeta}>{patientSummary(patient)}</Text>
                              </View>
                              {active ? <Ionicons name="checkmark-circle" size={20} color="#0F766E" /> : null}
                            </Pressable>
                          );
                        })
                      )}
                      {composerErrors.patientId ? <Text style={styles.errorText}>{composerErrors.patientId}</Text> : null}
                    </>
                  ) : null}

                  {currentStep === "due" ? (
                    <>
                      <View style={styles.choiceRow}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => updateDraft("dueEnabled", true)}
                          style={[styles.choiceCardCompact, draft.dueEnabled ? styles.choiceCardActive : null]}
                        >
                          <Text style={styles.choiceCardTitle}>Definir prazo</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => updateDraft("dueEnabled", false)}
                          style={[styles.choiceCardCompact, !draft.dueEnabled ? styles.choiceCardActive : null]}
                        >
                          <Text style={styles.choiceCardTitle}>Sem prazo manual</Text>
                        </Pressable>
                      </View>
                      {draft.dueEnabled ? (
                        <View style={styles.inlineInputsRow}>
                          <TextInput
                            value={draft.dueDateKey}
                            onChangeText={(value) => updateDraft("dueDateKey", value)}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor="#98A2B3"
                            style={[styles.input, styles.inlineInput]}
                          />
                          <TextInput
                            value={draft.dueTime}
                            onChangeText={(value) => updateDraft("dueTime", value)}
                            placeholder="HH:mm"
                            placeholderTextColor="#98A2B3"
                            style={[styles.input, styles.inlineInput]}
                          />
                        </View>
                      ) : (
                        <Text style={styles.hintText}>Sistema aplicara prazo padrao de seguranca automaticamente.</Text>
                      )}
                      {composerErrors.dueDateKey ? <Text style={styles.errorText}>{composerErrors.dueDateKey}</Text> : null}
                      {composerErrors.dueTime ? <Text style={styles.errorText}>{composerErrors.dueTime}</Text> : null}
                    </>
                  ) : null}

                  {currentStep === "recurrence" ? (
                    <>
                      <View style={styles.optionsRow}>
                        {[
                          { value: "none", label: "Sem recorrencia" },
                          { value: "daily", label: "Diaria" },
                          { value: "weekly", label: "Semanal" },
                        ].map((option) => (
                          <Pressable
                            key={option.value}
                            accessibilityRole="button"
                            onPress={() => updateDraft("recurrenceRule", option.value as ActivityRecurrenceRule)}
                            style={[
                              styles.optionButton,
                              draft.recurrenceRule === option.value ? styles.optionButtonActive : null,
                            ]}
                          >
                            <Text style={styles.optionButtonText}>{option.label}</Text>
                          </Pressable>
                        ))}
                      </View>

                      {draft.recurrenceRule !== "none" ? (
                        <>
                          <TextInput
                            value={draft.recurrenceInterval}
                            onChangeText={(value) => updateDraft("recurrenceInterval", value)}
                            keyboardType="numeric"
                            placeholder="Intervalo (ex: 1)"
                            placeholderTextColor="#98A2B3"
                            style={styles.input}
                          />
                          {draft.recurrenceRule === "weekly" ? (
                            <View style={styles.optionsRow}>
                              {WEEKDAY_OPTIONS.map((option) => {
                                const selected = draft.recurrenceWeekdays.includes(option.value);
                                return (
                                  <Pressable
                                    key={option.value}
                                    accessibilityRole="button"
                                    onPress={() => toggleWeekday(option.value)}
                                    style={[styles.optionButton, selected ? styles.optionButtonActive : null]}
                                  >
                                    <Text style={styles.optionButtonText}>{option.label}</Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          ) : null}
                        </>
                      ) : null}
                      {composerErrors.recurrenceInterval ? <Text style={styles.errorText}>{composerErrors.recurrenceInterval}</Text> : null}
                    </>
                  ) : null}

                  {currentStep === "send" ? (
                    <>
                      <View style={styles.choiceRow}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => updateDraft("sendMode", "immediate")}
                          style={[styles.choiceCardCompact, draft.sendMode === "immediate" ? styles.choiceCardActive : null]}
                        >
                          <Text style={styles.choiceCardTitle}>Enviar agora</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => updateDraft("sendMode", "scheduled")}
                          style={[styles.choiceCardCompact, draft.sendMode === "scheduled" ? styles.choiceCardActive : null]}
                        >
                          <Text style={styles.choiceCardTitle}>Agendar envio</Text>
                        </Pressable>
                      </View>
                      {draft.sendMode === "scheduled" ? (
                        <View style={styles.inlineInputsRow}>
                          <TextInput
                            value={draft.scheduledDateKey}
                            onChangeText={(value) => updateDraft("scheduledDateKey", value)}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor="#98A2B3"
                            style={[styles.input, styles.inlineInput]}
                          />
                          <TextInput
                            value={draft.scheduledTime}
                            onChangeText={(value) => updateDraft("scheduledTime", value)}
                            placeholder="HH:mm"
                            placeholderTextColor="#98A2B3"
                            style={[styles.input, styles.inlineInput]}
                          />
                        </View>
                      ) : null}
                      {composerErrors.scheduledDateKey ? <Text style={styles.errorText}>{composerErrors.scheduledDateKey}</Text> : null}
                      {composerErrors.scheduledTime ? <Text style={styles.errorText}>{composerErrors.scheduledTime}</Text> : null}
                    </>
                  ) : null}

                  {currentStep === "confirm" ? (
                    <View style={styles.summaryCard}>
                      <Text style={styles.summaryTitle}>{draft.title.trim() || "Sem titulo"}</Text>
                      <Text style={styles.summaryLine}>Tipo: {labelForTemplateType(draft.intent === "document" ? "document_reading" : draft.activityType)}</Text>
                      <Text style={styles.summaryLine}>Paciente: {selectedPatient?.fullName ?? "Nao selecionado"}</Text>
                      <Text style={styles.summaryLine}>Prazo: {duePreview}</Text>
                      <Text style={styles.summaryLine}>Envio: {sendPreview}</Text>
                      <Text style={styles.summaryLine}>
                        Recorrencia: {draft.recurrenceRule === "none" ? "Nao" : `${draft.recurrenceRule} (intervalo ${draft.recurrenceInterval || "1"})`}
                      </Text>
                      {selectedTemplate ? (
                        <Text style={styles.summaryLine}>Template base: {selectedTemplate.title}</Text>
                      ) : null}
                    </View>
                  ) : null}

                  {currentStep === "result" ? (
                    <View style={styles.resultCard}>
                      <Text style={styles.resultTitle}>{submitFeedback.title}</Text>
                      <Text style={styles.resultMessage}>{submitFeedback.message}</Text>
                      <View style={styles.resultActionsRow}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={openNewComposer}
                          style={styles.navButton}
                        >
                          <Text style={styles.navButtonText}>Nova atividade</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={closeComposer}
                          style={styles.navButton}
                        >
                          <Text style={styles.navButtonText}>Fechar editor</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              </ScrollView>
            </View>

            {currentStep !== "result" ? (
              <View style={styles.footerRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={currentStep === "intent" || isSubmitting}
                  onPress={() => moveStep("back")}
                  testID="activities-step-back"
                  style={[
                    styles.navButton,
                    currentStep === "intent" || isSubmitting ? styles.navButtonDisabled : null,
                  ]}
                >
                  <Text style={styles.navButtonText}>Voltar</Text>
                </Pressable>

                {currentStep === "confirm" ? (
                  <Pressable
                    accessibilityRole="button"
                    testID="activities-create-submit"
                    disabled={isSubmitting}
                    onPress={() => void submitComposer()}
                    style={[styles.submitButton, isSubmitting ? styles.navButtonDisabled : null]}
                  >
                    <Text style={styles.submitButtonText}>
                      {isSubmitting ? "Concluindo..." : "Concluir fluxo"}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    testID="activities-step-next"
                    onPress={() => moveStep("next")}
                    style={styles.submitButton}
                  >
                    <Text style={styles.submitButtonText}>Continuar</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>

          {isLoading ? <Text style={styles.loadingText}>Carregando atividades...</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {info ? <Text style={styles.infoText}>{info}</Text> : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  queueBadge: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FEC84B",
    backgroundColor: "#FFFAEB",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  queueBadgeText: {
    color: "#B54708",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
  },
  queueBadgeButton: {
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  queueBadgeButtonText: {
    color: "#344054",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
    fontFamily: typographyContract.fontFamily,
  },
  sectionTitle: {
    color: "#101828",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
  },
  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  workspaceCard: {
    width: "48.5%",
    minHeight: 160,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  createWorkspaceCard: {
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  createCardTitle: {
    color: "#101828",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center",
    fontFamily: typographyContract.fontFamily,
  },
  createCardSubtitle: {
    color: "#667085",
    fontSize: 11.5,
    lineHeight: 15,
    textAlign: "center",
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  workspaceCardActive: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF3",
  },
  workspaceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceTitle: {
    color: "#101828",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
  },
  workspaceMeta: {
    color: "#667085",
    fontSize: 11,
    lineHeight: 14,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  loadingText: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  errorText: {
    color: "#B42318",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: "700",
  },
  infoText: {
    color: "#027A48",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: "700",
  },
  composerCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 2,
  },
  composerCardFullscreen: {
    minHeight: 640,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modalTitle: {
    color: "#101828",
    fontSize: 17,
    lineHeight: 24,
    fontWeight: typographyContract.fontWeight,
    fontFamily: typographyContract.fontFamily,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F4F7",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 28,
    paddingHorizontal: 2,
  },
  patientSearchWrap: {
    flex: 1,
    minHeight: 30,
    maxWidth: 260,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  patientSearchInput: {
    flex: 1,
    minHeight: 28,
    color: "#101828",
    fontFamily: typographyContract.fontFamily,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
    paddingVertical: 0,
  },
  stepTag: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    paddingHorizontal: 10,
    minHeight: 26,
    minWidth: 82,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  stepTagText: {
    color: "#344054",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
    fontFamily: typographyContract.fontFamily,
  },
  body: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EAECF0",
    backgroundColor: "#FCFCFD",
    overflow: "hidden",
  },
  scrollBodyContent: {
    padding: 10,
    gap: 10,
  },
  modalSection: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: "#FFFFFF",
  },
  stepTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: typographyContract.fontWeight,
  },
  stepDescription: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  helperText: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  intentChoiceStack: {
    gap: 8,
  },
  choiceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  choiceCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  choiceCardCompact: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceCardActive: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF5",
  },
  choiceCardTitle: {
    color: "#101828",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
  },
  choiceCardSubtitle: {
    color: "#667085",
    fontSize: 11.5,
    lineHeight: 14,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  activityTypeStack: {
    gap: 8,
  },
  activityTypeCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  activityTypeCardActive: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF3",
  },
  activityTypeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  activityTypeIconWrapActive: {
    borderColor: "#99F6E4",
    backgroundColor: "#ECFDF5",
  },
  activityTypeTextWrap: {
    flex: 1,
    gap: 1,
  },
  activityTypeTitle: {
    color: "#101828",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
    fontFamily: typographyContract.fontFamily,
  },
  activityTypeSubtitle: {
    color: "#667085",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
    fontFamily: typographyContract.fontFamily,
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  optionButtonActive: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF3",
  },
  optionButtonText: {
    color: "#344054",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    color: "#101828",
    minHeight: 40,
    paddingHorizontal: 10,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  hintText: {
    color: "#667085",
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  patientCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 2,
  },
  patientCardActive: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF3",
    shadowOpacity: 0.12,
    elevation: 3,
  },
  patientAvatar: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  patientAvatarText: {
    fontFamily: typographyContract.fontFamily,
    color: "#1E293B",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  patientInfo: {
    flex: 1,
    gap: 2,
  },
  patientName: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  patientMeta: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  patientsEmptyText: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
    paddingVertical: 6,
  },
  inlineInputsRow: {
    flexDirection: "row",
    gap: 8,
  },
  inlineInput: {
    flex: 1,
  },
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  summaryTitle: {
    color: "#101828",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
  },
  summaryLine: {
    color: "#475467",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  resultCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EAECF0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: "center",
    gap: 8,
  },
  resultTitle: {
    color: "#101828",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
  },
  resultMessage: {
    color: "#475467",
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
    textAlign: "center",
  },
  resultActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  footerRow: {
    flexDirection: "row",
    gap: 8,
  },
  navButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#F2F4F7",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  navButtonText: {
    color: "#344054",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  navButtonDisabled: {
    opacity: 0.55,
  },
  submitButton: {
    flex: 1.6,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: "#0F766E",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
});
