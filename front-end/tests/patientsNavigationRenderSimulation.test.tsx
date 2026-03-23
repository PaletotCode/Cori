import { performance } from "node:perf_hooks";

import React, { Profiler, type ProfilerOnRenderCallback } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import type { ActivitiesApiClient } from "../src/features/activities/api/activitiesApiClient";
import type { ActivityItem } from "../src/features/activities/api/types";
import type { FormsApiClient } from "../src/features/forms/api/formsApiClient";
import type { ClinicalFormListItem } from "../src/features/forms/api/types";
import type { NotificationsApiClient } from "../src/features/notifications/api/notificationsApiClient";
import type {
  NotificationDelivery,
  NotificationPreferences,
  UnifiedTimelineEvent,
} from "../src/features/notifications/api/types";
import type { PatientsApiClient } from "../src/features/patients/api/patientsApiClient";
import type {
  PatientChange,
  PatientDetail,
  PatientListItem,
  PatientTimelineEvent,
} from "../src/features/patients/api/types";
import {
  __resetPatientsScreenCacheForTests,
  PsychologistPatientsScreen,
} from "../src/features/patients/screens/PsychologistPatientsScreen";
import type { SessionsApiClient } from "../src/features/sessions/api/sessionsApiClient";
import type { SessionAgendaItem } from "../src/features/sessions/api/types";

const mockAuthState = {
  hydrated: true,
  status: "authenticated" as const,
  tokens: {
    accessToken: "access-token",
  },
  profile: {
    onboardingCompleted: true,
  },
};

jest.mock("../src/features/auth/hooks/useAuthStore", () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

jest.mock("react-native", () => {
  const makeComponent = (name: string) =>
    function MockComponent(props: Record<string, unknown>) {
      return React.createElement(name, props, props.children as React.ReactNode);
    };

  class AnimatedValue {
    value: number;

    constructor(value: number) {
      this.value = value;
    }

    setValue(next: number) {
      this.value = next;
    }

    interpolate(config: { outputRange?: number[] }) {
      return config.outputRange?.[0] ?? this.value;
    }
  }

  const Animated = {
    Value: AnimatedValue,
    timing: () => ({
      start: (callback?: ({ finished }: { finished: boolean }) => void) => {
        callback?.({ finished: true });
      },
      stop: () => undefined,
    }),
    View: makeComponent("AnimatedView"),
  };

  return {
    ActivityIndicator: makeComponent("ActivityIndicator"),
    Animated,
    InteractionManager: {
      runAfterInteractions: (task: () => void) => {
        task();
        return {
          cancel: () => undefined,
        };
      },
    },
    Modal: makeComponent("Modal"),
    Pressable: makeComponent("Pressable"),
    RefreshControl: makeComponent("RefreshControl"),
    ScrollView: makeComponent("ScrollView"),
    Text: makeComponent("Text"),
    TextInput: makeComponent("TextInput"),
    TouchableOpacity: makeComponent("TouchableOpacity"),
    View: makeComponent("View"),
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
    Linking: {
      openURL: async () => undefined,
    },
    Easing: {
      cubic: "cubic",
      out: (value: unknown) => value,
    },
    StyleSheet: {
      create: (styles: unknown) => styles,
    },
  };
});

jest.mock("react-native-svg", () => {
  const ReactRuntime = jest.requireActual("react") as typeof import("react");
  const Svg = (props: Record<string, unknown>) =>
    ReactRuntime.createElement("Svg", props, props.children as React.ReactNode);
  const Path = (props: Record<string, unknown>) =>
    ReactRuntime.createElement("Path", props, props.children as React.ReactNode);
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Path,
  };
});

interface CommitMetric {
  phase: "mount" | "update" | "nested-update";
  actualDuration: number;
  commitTime: number;
}

interface CycleMetric {
  cycle: number;
  openLatencyMs: number;
  backLatencyMs: number;
  openCommitCount: number;
  backCommitCount: number;
  openMaxCommitMs: number;
  backMaxCommitMs: number;
}

interface RenderSimulationResult {
  cycles: CycleMetric[];
  totalCommits: number;
  maxCommitMs: number;
  avgCommitMs: number;
}

const TOTAL_PATIENTS = 220;
const TARGET_PATIENT_ID = "patient-110";
const TARGET_PATIENT_INDEX = 109;

function findByTestId(root: ReactTestInstance, testID: string): ReactTestInstance {
  return root.findByProps({ testID });
}

async function flushMicrotasks(cycles = 8): Promise<void> {
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function waitForTestId(
  root: ReactTestInstance,
  testID: string,
  attempts = 60,
): Promise<ReactTestInstance> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return findByTestId(root, testID);
    } catch (searchError) {
      if (attempt === attempts - 1) {
        throw searchError;
      }
      await flushMicrotasks(2);
    }
  }

  throw new Error(`Elemento nao encontrado: ${testID}`);
}

function makeIsoDate(year: number, month: number, day: number, hour = 9): string {
  const monthValue = String(month).padStart(2, "0");
  const dayValue = String(day).padStart(2, "0");
  const hourValue = String(hour).padStart(2, "0");
  return `${year}-${monthValue}-${dayValue}T${hourValue}:00:00.000Z`;
}

function buildPatients(): PatientListItem[] {
  return Array.from({ length: TOTAL_PATIENTS }, (_, index) => {
    const id = `patient-${String(index + 1).padStart(3, "0")}`;
    return {
      id,
      fullName: `Paciente ${index + 1}`,
      preferredName: index % 4 === 0 ? `P${index + 1}` : null,
      email: `paciente${index + 1}@cori.dev`,
      phone: `+55659999${String(1000 + index).padStart(4, "0")}`,
      preferredContactChannel: "whatsapp",
      profileSource: "manual",
      whatsappNumberValid: true,
      profilePhotoUrl: null,
      profileBannerUrl: null,
      updatedAt: makeIsoDate(2026, 3, 1 + (index % 20), 10),
    };
  });
}

function buildPatientDetail(patientId: string, patientName: string): PatientDetail {
  return {
    id: patientId,
    tenantId: "tenant-1",
    fullName: patientName,
    preferredName: "Preferido",
    email: `${patientId}@cori.dev`,
    phone: "+5565999990001",
    birthDate: "1990-01-01",
    pronouns: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    preferredContactChannel: "whatsapp",
    communicationNotes: "Perfil de simulacao para stress test de renderizacao.",
    profilePhotoUrl: null,
    profileBannerUrl: null,
    profileSource: "manual",
    whatsappNumberValid: true,
    // Inicio antigo para forcar range de sessoes maior no detalhe.
    createdAt: "2019-01-01T09:00:00.000Z",
    updatedAt: "2026-03-19T09:00:00.000Z",
  };
}

function buildPatientChanges(patientId: string): PatientChange[] {
  return Array.from({ length: 180 }, (_, index) => ({
    id: `${patientId}-change-${index + 1}`,
    changeType: "updated",
    changedFields: ["communication_notes", "preferred_contact_period"],
    previousData: { preferred_contact_period: "afternoon" },
    newData: { preferred_contact_period: "night" },
    changedByUserId: "psychologist-1",
    reason: "Atualizacao de acompanhamento",
    createdAt: makeIsoDate(2025, ((index % 12) + 1), ((index % 27) + 1), 8 + (index % 8)),
  }));
}

function buildProfileTimeline(patientId: string): PatientTimelineEvent[] {
  return Array.from({ length: 220 }, (_, index) => ({
    id: `${patientId}-profile-${index + 1}`,
    eventType: index % 2 === 0 ? "patient_profile_updated" : "patient_profile_viewed",
    actorType: "psychologist",
    actorId: "psychologist-1",
    payload: {
      field: "communication_notes",
      value: `nota-${index + 1}`,
    },
    createdAt: makeIsoDate(2025, ((index % 12) + 1), ((index % 27) + 1), 7 + (index % 10)),
  }));
}

function buildUnifiedTimeline(patientId: string): UnifiedTimelineEvent[] {
  const categories = ["sessions", "activities", "forms", "notifications"] as const;
  return Array.from({ length: 320 }, (_, index) => ({
    id: `${patientId}-unified-${index + 1}`,
    category: categories[index % categories.length],
    eventType: "simulated_event",
    actorType: "system",
    actorId: null,
    sessionId: index % 3 === 0 ? `session-${index + 1}` : null,
    activityId: index % 3 === 1 ? `activity-${index + 1}` : null,
    formId: index % 3 === 2 ? `form-${index + 1}` : null,
    notificationDeliveryId: `delivery-${index + 1}`,
    payload: {
      index,
      label: `payload-${index + 1}`,
      details: "evento sintetico para simulacao de stress",
    },
    createdAt: makeIsoDate(2025, ((index % 12) + 1), ((index % 27) + 1), 6 + (index % 12)),
  }));
}

function buildDeliveries(patientId: string): NotificationDelivery[] {
  return Array.from({ length: 240 }, (_, index) => ({
    id: `${patientId}-delivery-${index + 1}`,
    tenantId: "tenant-1",
    patientId,
    eventType: "simulated_notification",
    category: index % 2 === 0 ? "notifications" : "sessions",
    title: `Notificacao ${index + 1}`,
    body: "mensagem sintetica para simulacao",
    status: "delivered",
    statusReason: null,
    channelInbox: true,
    channelPush: true,
    channelRealtime: true,
    metadata: { index },
    queuedAt: makeIsoDate(2025, ((index % 12) + 1), ((index % 27) + 1), 8),
    sentAt: makeIsoDate(2025, ((index % 12) + 1), ((index % 27) + 1), 8),
    deliveredAt: makeIsoDate(2025, ((index % 12) + 1), ((index % 27) + 1), 8),
    openedAt: null,
    actionTakenAt: null,
    failedAt: null,
    createdAt: makeIsoDate(2025, ((index % 12) + 1), ((index % 27) + 1), 8),
    updatedAt: makeIsoDate(2025, ((index % 12) + 1), ((index % 27) + 1), 8),
  }));
}

function buildNotificationPreferences(patientId: string): NotificationPreferences {
  return {
    id: "preferences-1",
    tenantId: "tenant-1",
    patientId,
    eventCategory: "all",
    enabled: true,
    inboxEnabled: true,
    pushEnabled: true,
    realtimeEnabled: true,
    quietHoursStart: null,
    quietHoursEnd: null,
    maxNotificationsPerHour: 12,
    source: "explicit",
    updatedAt: "2026-03-19T09:00:00.000Z",
  };
}

function buildActivities(patientId: string): ActivityItem[] {
  return Array.from({ length: 1300 }, (_, index) => {
    const assignedPatientId =
      index % 5 === 0
        ? patientId
        : `patient-${String(((index + 17) % TOTAL_PATIENTS) + 1).padStart(3, "0")}`;
    return {
      id: `activity-${index + 1}`,
      patientId: assignedPatientId,
      patientName: `Paciente ${assignedPatientId}`,
      psychologistId: "psychologist-1",
      sourceTemplateId: null,
      activityType: "simple_task",
      status: "assigned",
      title: `Atividade ${index + 1}`,
      dueAt: makeIsoDate(2026, ((index % 12) + 1), ((index % 27) + 1), 17),
      scheduledSendAt: null,
      assignedAt: makeIsoDate(2026, ((index % 12) + 1), ((index % 27) + 1), 9),
      overdueAt: null,
      recurrenceRule: "none",
      recurrenceInterval: 1,
      recurrenceEndAt: null,
      executionElapsedSeconds: 0,
    };
  });
}

function buildForms(patientId: string): ClinicalFormListItem[] {
  return Array.from({ length: 900 }, (_, index) => {
    const assignedPatientId =
      index % 4 === 0
        ? patientId
        : `patient-${String(((index + 23) % TOTAL_PATIENTS) + 1).padStart(3, "0")}`;
    return {
      id: `form-${index + 1}`,
      patientId: assignedPatientId,
      patientName: `Paciente ${assignedPatientId}`,
      psychologistId: "psychologist-1",
      sourceTemplateId: null,
      status: "assigned",
      title: `Formulario ${index + 1}`,
      subtitle: null,
      publishedAt: null,
      scheduledSendAt: null,
      assignedAt: makeIsoDate(2026, ((index % 12) + 1), ((index % 27) + 1), 10),
      submittedAt: null,
      reviewedAt: null,
    };
  });
}

function buildMonthAgenda(referenceDate: string, patientId: string): SessionAgendaItem[] {
  const [yearRaw, monthRaw] = referenceDate.split("-");
  const year = Number.parseInt(yearRaw ?? "2026", 10);
  const month = Number.parseInt(monthRaw ?? "1", 10);
  const normalizedYear = Number.isFinite(year) ? year : 2026;
  const normalizedMonth = Number.isFinite(month) ? month : 1;

  return Array.from({ length: 55 }, (_, index) => {
    const assignedPatientId =
      index % 4 === 0
        ? patientId
        : `patient-${String(((index * 7) % TOTAL_PATIENTS) + 1).padStart(3, "0")}`;
    const day = ((index % 27) + 1);
    return {
      id: `session-${normalizedYear}-${normalizedMonth}-${index + 1}`,
      patientId: assignedPatientId,
      patientName: `Paciente ${assignedPatientId}`,
      psychologistId: "psychologist-1",
      status: index % 3 === 0 ? "completed" : "scheduled",
      locationMode: "online",
      scheduledStartAt: makeIsoDate(normalizedYear, normalizedMonth, day, 9 + (index % 7)),
      scheduledEndAt: makeIsoDate(normalizedYear, normalizedMonth, day, 10 + (index % 7)),
      confirmationTokenExpiresAt: makeIsoDate(normalizedYear, normalizedMonth, day, 8 + (index % 7)),
    };
  });
}

function createSimulationClients() {
  const patients = buildPatients();
  const targetPatient = patients[TARGET_PATIENT_INDEX];
  if (!targetPatient || targetPatient.id !== TARGET_PATIENT_ID) {
    throw new Error("Paciente alvo da simulacao nao encontrado.");
  }

  const detail = buildPatientDetail(targetPatient.id, targetPatient.fullName);
  const patientChanges = buildPatientChanges(targetPatient.id);
  const profileTimeline = buildProfileTimeline(targetPatient.id);
  const unifiedTimeline = buildUnifiedTimeline(targetPatient.id);
  const deliveries = buildDeliveries(targetPatient.id);
  const notificationPreferences = buildNotificationPreferences(targetPatient.id);
  const activities = buildActivities(targetPatient.id);
  const forms = buildForms(targetPatient.id);

  const apiClient: PatientsApiClient = {
    list: jest.fn(async () => patients),
    create: jest.fn(async () => detail),
    get: jest.fn(async () => detail),
    update: jest.fn(async () => detail),
    archive: jest.fn(async () => ({
      patientId: targetPatient.id,
      archivedAt: "2026-03-19T10:00:00.000Z",
    })),
    listChanges: jest.fn(async () => patientChanges),
    listTimelineEvents: jest.fn(async () => profileTimeline),
  };

  const notificationsClient = {
    listUnifiedTimeline: jest.fn(async () => unifiedTimeline),
    listPatientNotifications: jest.fn(async () => deliveries),
    getPatientPreferences: jest.fn(async () => notificationPreferences),
  } as unknown as NotificationsApiClient;

  const activitiesClient = {
    listActivities: jest.fn(async () => activities),
  } as unknown as ActivitiesApiClient;

  const formsClient = {
    listForms: jest.fn(async () => forms),
  } as unknown as FormsApiClient;

  const sessionsClient = {
    listAgenda: jest.fn(async (_token: string, options?: { referenceDate?: string }) =>
      buildMonthAgenda(options?.referenceDate ?? "2026-01-01", targetPatient.id),
    ),
  } as unknown as SessionsApiClient;

  return {
    apiClient,
    notificationsClient,
    activitiesClient,
    formsClient,
    sessionsClient,
    targetPatient,
  };
}

function summarizeCommits(commits: CommitMetric[]) {
  const totalDuration = commits.reduce((sum, metric) => sum + metric.actualDuration, 0);
  const maxDuration = commits.reduce(
    (maxValue, metric) => Math.max(maxValue, metric.actualDuration),
    0,
  );
  return {
    count: commits.length,
    avgDuration: commits.length > 0 ? totalDuration / commits.length : 0,
    maxDuration,
  };
}

async function runRenderSimulation(): Promise<RenderSimulationResult> {
  const {
    apiClient,
    notificationsClient,
    activitiesClient,
    formsClient,
    sessionsClient,
    targetPatient,
  } = createSimulationClients();

  const commits: CommitMetric[] = [];
  const onRender: ProfilerOnRenderCallback = (
    _id,
    phase,
    actualDuration,
    _baseDuration,
    _startTime,
    commitTime,
  ) => {
    commits.push({
      phase,
      actualDuration,
      commitTime,
    });
  };

  let tree: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      React.createElement(
        Profiler,
        {
          id: "patients-navigation-simulation",
          onRender,
        },
        React.createElement(PsychologistPatientsScreen, {
          apiClient,
          notificationsClient,
          activitiesClient,
          formsClient,
          sessionsClient,
        }),
      ),
    );
  });
  await flushMicrotasks(12);

  const root = tree!.root;
  const cycleMetrics: CycleMetric[] = [];
  const cycles = 4;

  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    const openButton = await waitForTestId(root, `patients-open-${targetPatient.id}`);
    const openCommitStartIndex = commits.length;
    const openStart = performance.now();
    await act(async () => {
      openButton.props.onPress();
    });
    await waitForTestId(root, "patients-back-to-list");
    await flushMicrotasks(8);
    const openLatencyMs = performance.now() - openStart;
    const openCommitStats = summarizeCommits(commits.slice(openCommitStartIndex));

    const backButton = await waitForTestId(root, "patients-back-to-list");
    const backCommitStartIndex = commits.length;
    const backStart = performance.now();
    await act(async () => {
      backButton.props.onPress();
    });
    await waitForTestId(root, `patients-open-${targetPatient.id}`);
    await flushMicrotasks(8);
    const backLatencyMs = performance.now() - backStart;
    const backCommitStats = summarizeCommits(commits.slice(backCommitStartIndex));

    cycleMetrics.push({
      cycle,
      openLatencyMs: Number(openLatencyMs.toFixed(2)),
      backLatencyMs: Number(backLatencyMs.toFixed(2)),
      openCommitCount: openCommitStats.count,
      backCommitCount: backCommitStats.count,
      openMaxCommitMs: Number(openCommitStats.maxDuration.toFixed(2)),
      backMaxCommitMs: Number(backCommitStats.maxDuration.toFixed(2)),
    });
  }

  const globalSummary = summarizeCommits(commits);
  return {
    cycles: cycleMetrics,
    totalCommits: globalSummary.count,
    maxCommitMs: Number(globalSummary.maxDuration.toFixed(2)),
    avgCommitMs: Number(globalSummary.avgDuration.toFixed(2)),
  };
}

const shouldRunSimulation = process.env.PATIENTS_PERF_SIM === "1";

describe(shouldRunSimulation ? "patients navigation render simulation (temporary)" : "patients navigation render simulation (temporary, skipped)", () => {
  beforeEach(() => {
    __resetPatientsScreenCacheForTests();
  });

  const testRunner = shouldRunSimulation ? it : it.skip;

  testRunner("simulates repeated open/back navigation and prints render metrics", async () => {
    const report = await runRenderSimulation();

    console.info(
      `[patients-render-sim] ${JSON.stringify(
        {
          cycles: report.cycles,
          totalCommits: report.totalCommits,
          maxCommitMs: report.maxCommitMs,
          avgCommitMs: report.avgCommitMs,
        },
        null,
        2,
      )}`,
    );

    expect(report.cycles).toHaveLength(4);
    expect(report.totalCommits).toBeGreaterThan(0);
  });
});
