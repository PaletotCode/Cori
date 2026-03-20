/* eslint-disable react/prop-types */

import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { typographyContract } from "../../../../shared/ui/typography";
import type { PatientListItem } from "../../../patients/api/types";
import { agendaModalContract } from "./agendaModalContract";
import type {
  AgendaAssignMode,
  AgendaAssignResult,
  AgendaAssignSheetProps,
  AssignActivityDraft,
  AssignFormDraft,
  AssignSessionDraft,
} from "./AgendaAssignSheet.types";

type RootFlow = "root" | "session" | "unified";
type SessionStep = "patient" | "datetime" | "confirm" | "result";
type UnifiedStep = "kind" | "patient" | "send" | "due" | "note" | "confirm" | "result";
type UnifiedKind = "activity" | "form" | "both";
type LocalResultStatus = "idle" | "loading" | "success" | "error";

interface SessionErrors {
  patientId?: string;
  dateKey?: string;
  startTime?: string;
  endTime?: string;
}

interface UnifiedErrors {
  kind?: string;
  patientId?: string;
  scheduledDateKey?: string;
  scheduledTime?: string;
  dueDateKey?: string;
  dueTime?: string;
  activityTemplate?: string;
  formTemplate?: string;
}

const SESSION_STEPS: SessionStep[] = ["patient", "datetime", "confirm"];
const UNIFIED_STEPS: UnifiedStep[] = ["kind", "patient", "send", "due", "note", "confirm"];

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

function toLocalDate(dateKey: string, time: string): Date | null {
  if (!isDateKeyValid(dateKey) || !isTimeValid(time)) {
    return null;
  }
  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  const [hourRaw, minuteRaw] = time.split(":");
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

function truncateValue(value: string | null | undefined, maxLength = 100): string {
  if (value === null || value === undefined || value.trim().length === 0) {
    return "Sem detalhes adicionais.";
  }
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
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

function shouldHandleActivity(kind: UnifiedKind): boolean {
  return kind === "activity" || kind === "both";
}

function shouldHandleForm(kind: UnifiedKind): boolean {
  return kind === "form" || kind === "both";
}

function StepTag({ value }: { value: string }) {
  return (
    <View style={styles.stepTag}>
      <Text style={styles.stepTagText}>{value}</Text>
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

function LocalResultPanel({
  status,
  title,
  message,
  motion,
}: {
  status: LocalResultStatus;
  title: string;
  message: string | null;
  motion: Animated.Value;
}) {
  if (status === "idle") {
    return null;
  }

  const success = status === "success";
  const loading = status === "loading";

  return (
    <Animated.View
      style={[
        styles.resultCard,
        {
          opacity: motion,
          transform: [
            {
              translateY: motion.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
            {
              scale: motion.interpolate({
                inputRange: [0, 1],
                outputRange: [0.98, 1],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.resultIconWrap}>
        <Ionicons
          name={loading ? "time-outline" : success ? "checkmark-circle" : "alert-circle"}
          size={40}
          color={loading ? "#0369A1" : success ? "#0F766E" : "#B42318"}
        />
      </View>
      <Text style={styles.resultTitle}>{title}</Text>
      {message ? <Text style={styles.resultMessage}>{message}</Text> : null}
    </Animated.View>
  );
}

function PatientCards({
  patients,
  selectedPatientId,
  onSelect,
  testIdPrefix,
  emptyMessage = "Nenhum paciente encontrado para o filtro informado.",
}: {
  patients: PatientListItem[];
  selectedPatientId: string;
  onSelect: (patientId: string) => void;
  testIdPrefix: string;
  emptyMessage?: string;
}) {
  if (patients.length === 0) {
    return <Text style={styles.patientsEmptyText}>{emptyMessage}</Text>;
  }

  return (
    <>
      {patients.map((patient) => {
        const active = patient.id === selectedPatientId;
        return (
          <Pressable
            key={patient.id}
            accessibilityRole="button"
            accessibilityLabel={`Selecionar paciente ${patient.fullName}`}
            testID={`${testIdPrefix}-${patient.id}`}
            onPress={() => onSelect(patient.id)}
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
      })}
    </>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return <Text style={styles.fieldErrorText}>{message}</Text>;
}

function unifiedKindLabel(kind: UnifiedKind): string {
  if (kind === "activity") {
    return "Apenas atividade";
  }
  if (kind === "form") {
    return "Apenas formulario";
  }
  return "Atividade e formulario";
}

function submitLabel(mode: AgendaAssignMode, loading: boolean): string {
  if (mode === "session") {
    return loading ? "Atribuindo sessao..." : "Confirmar sessao";
  }
  if (mode === "activity") {
    return loading ? "Atribuindo atividade..." : "Confirmar atribuicao";
  }
  return loading ? "Atribuindo formulario..." : "Confirmar atribuicao";
}

function mergeResult(first: AgendaAssignResult, second: AgendaAssignResult | null): AgendaAssignResult {
  if (!first.ok) {
    return first;
  }
  if (second === null) {
    return first;
  }
  if (!second.ok) {
    return second;
  }
  return {
    ok: true,
    message: `${first.message} ${second.message}`,
  };
}

export function AgendaAssignSheet({
  visible,
  selectedDateKey,
  enableUnifiedFlow = true,
  patients,
  activityTemplates,
  formTemplates,
  loadingTemplates,
  flowStatusByMode,
  errorMessageByMode,
  onClose,
  onAssignSession,
  onAssignActivity,
  onAssignForm,
  onOpenActivitiesTemplates,
  onOpenFormTemplates,
}: AgendaAssignSheetProps) {
  const [mounted, setMounted] = useState(visible);
  const modalMotion = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const stepMotion = useRef(new Animated.Value(1)).current;
  const resultMotion = useRef(new Animated.Value(0)).current;

  const [flow, setFlow] = useState<RootFlow>("root");
  const [sessionStep, setSessionStep] = useState<SessionStep>("patient");
  const [unifiedStep, setUnifiedStep] = useState<UnifiedStep>("kind");
  const [unifiedKind, setUnifiedKind] = useState<UnifiedKind>("activity");

  const [sessionDraft, setSessionDraft] = useState<AssignSessionDraft>({
    patientId: "",
    dateKey: selectedDateKey,
    startTime: "08:00",
    endTime: "08:50",
    notes: "",
  });

  const [activityDraft, setActivityDraft] = useState<AssignActivityDraft>({
    templateId: "",
    patientId: "",
    sendMode: "immediate",
    scheduledDateKey: selectedDateKey,
    scheduledTime: "08:00",
    dueDateKey: selectedDateKey,
    dueTime: "18:00",
    skipDueDate: false,
    additionalNote: "",
  });

  const [formDraft, setFormDraft] = useState<AssignFormDraft>({
    templateId: "",
    patientId: "",
    sendMode: "immediate",
    scheduledDateKey: selectedDateKey,
    scheduledTime: "08:00",
    additionalNote: "",
  });

  const [sessionErrors, setSessionErrors] = useState<SessionErrors>({});
  const [unifiedErrors, setUnifiedErrors] = useState<UnifiedErrors>({});

  const [sessionResult, setSessionResult] = useState<{
    status: LocalResultStatus;
    title: string;
    message: string | null;
  }>({
    status: "idle",
    title: "",
    message: null,
  });

  const [unifiedResult, setUnifiedResult] = useState<{
    status: LocalResultStatus;
    title: string;
    message: string | null;
  }>({
    status: "idle",
    title: "",
    message: null,
  });

  const [activeSubmitMode, setActiveSubmitMode] = useState<AgendaAssignMode>("session");
  const [patientSearchText, setPatientSearchText] = useState("");

  useEffect(() => {
    if (visible) {
      setMounted(true);
      modalMotion.setValue(0);
      Animated.timing(modalMotion, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!mounted) {
      return;
    }

    Animated.timing(modalMotion, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [mounted, modalMotion, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const initialPatientId = patients[0]?.id ?? "";
    const initialActivityTemplateId = activityTemplates[0]?.id ?? "";
    const initialFormTemplateId = formTemplates[0]?.id ?? "";

    setFlow("root");
    setSessionStep("patient");
    setUnifiedStep("kind");
    setUnifiedKind("activity");

    setSessionDraft({
      patientId: initialPatientId,
      dateKey: selectedDateKey,
      startTime: "08:00",
      endTime: "08:50",
      notes: "",
    });

    setActivityDraft({
      templateId: initialActivityTemplateId,
      patientId: initialPatientId,
      sendMode: "immediate",
      scheduledDateKey: selectedDateKey,
      scheduledTime: "08:00",
      dueDateKey: selectedDateKey,
      dueTime: "18:00",
      skipDueDate: false,
      additionalNote: "",
    });

    setFormDraft({
      templateId: initialFormTemplateId,
      patientId: initialPatientId,
      sendMode: "immediate",
      scheduledDateKey: selectedDateKey,
      scheduledTime: "08:00",
      additionalNote: "",
    });

    setSessionErrors({});
    setUnifiedErrors({});

    setSessionResult({ status: "idle", title: "", message: null });
    setUnifiedResult({ status: "idle", title: "", message: null });
    setActiveSubmitMode("session");
    setPatientSearchText("");
    resultMotion.setValue(0);
  }, [activityTemplates, formTemplates, patients, resultMotion, selectedDateKey, visible]);

  const selectedActivityTemplate = useMemo(
    () => activityTemplates.find((item) => item.id === activityDraft.templateId) ?? null,
    [activityDraft.templateId, activityTemplates],
  );

  const selectedFormTemplate = useMemo(
    () => formTemplates.find((item) => item.id === formDraft.templateId) ?? null,
    [formDraft.templateId, formTemplates],
  );

  const loadingCurrentMode = flowStatusByMode[activeSubmitMode] === "loading";
  const isLocalSubmitting =
    (flow === "session" && sessionResult.status === "loading") ||
    (flow === "unified" && unifiedResult.status === "loading");

  const backendErrorMessage =
    flow === "session"
      ? errorMessageByMode.session ?? null
      : unifiedKind === "activity"
        ? errorMessageByMode.activity ?? null
        : unifiedKind === "form"
          ? errorMessageByMode.form ?? null
          : errorMessageByMode.activity ?? errorMessageByMode.form ?? null;

  const currentStepKey = useMemo(() => {
    if (flow === "root") {
      return "root";
    }
    if (flow === "session") {
      return `session:${sessionStep}`;
    }
    return `unified:${unifiedStep}`;
  }, [flow, sessionStep, unifiedStep]);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    stepMotion.setValue(0);
    Animated.timing(stepMotion, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [currentStepKey, mounted, stepMotion]);

  useEffect(() => {
    const activeResult = flow === "session" ? sessionResult : unifiedResult;
    if (activeResult.status === "idle") {
      return;
    }
    resultMotion.setValue(0);
    Animated.timing(resultMotion, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [flow, resultMotion, sessionResult, unifiedResult]);

  const overlayOpacity = useMemo(
    () =>
      modalMotion.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
    [modalMotion],
  );

  const modalTranslateY = useMemo(
    () =>
      modalMotion.interpolate({
        inputRange: [0, 1],
        outputRange: [24, 0],
      }),
    [modalMotion],
  );

  const modalScale = useMemo(
    () =>
      modalMotion.interpolate({
        inputRange: [0, 1],
        outputRange: [0.97, 1],
      }),
    [modalMotion],
  );

  const resetErrorsForFlow = useCallback(() => {
    setSessionErrors({});
    setUnifiedErrors({});
  }, []);

  const handleSelectPatientForUnified = useCallback((patientId: string) => {
    setActivityDraft((current) => ({ ...current, patientId }));
    setFormDraft((current) => ({ ...current, patientId }));
    setUnifiedErrors((current) => ({ ...current, patientId: undefined }));
  }, []);

  const handleSendModeChange = useCallback((nextMode: "immediate" | "scheduled") => {
    setActivityDraft((current) => ({ ...current, sendMode: nextMode }));
    setFormDraft((current) => ({ ...current, sendMode: nextMode }));
  }, []);

  const handleScheduledDateChange = useCallback((value: string) => {
    setActivityDraft((current) => ({ ...current, scheduledDateKey: value }));
    setFormDraft((current) => ({ ...current, scheduledDateKey: value }));
  }, []);

  const handleScheduledTimeChange = useCallback((value: string) => {
    setActivityDraft((current) => ({ ...current, scheduledTime: value }));
    setFormDraft((current) => ({ ...current, scheduledTime: value }));
  }, []);

  const validateSessionStep = useCallback(
    (step: SessionStep): boolean => {
      if (step === "patient") {
        const nextErrors: SessionErrors = {};
        if (sessionDraft.patientId.length === 0) {
          nextErrors.patientId = "Selecione um paciente para continuar.";
        }
        setSessionErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
      }

      if (step === "datetime") {
        const nextErrors: SessionErrors = {};
        if (!isDateKeyValid(sessionDraft.dateKey)) {
          nextErrors.dateKey = "Data invalida. Use YYYY-MM-DD.";
        }
        if (!isTimeValid(sessionDraft.startTime)) {
          nextErrors.startTime = "Hora inicial invalida. Use HH:mm.";
        }
        if (!isTimeValid(sessionDraft.endTime)) {
          nextErrors.endTime = "Hora final invalida. Use HH:mm.";
        }
        const start = toLocalDate(sessionDraft.dateKey, sessionDraft.startTime);
        const end = toLocalDate(sessionDraft.dateKey, sessionDraft.endTime);
        if (start !== null && end !== null && start.getTime() >= end.getTime()) {
          nextErrors.endTime = "A hora final deve ser maior que a inicial.";
        }
        setSessionErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
      }

      return true;
    },
    [sessionDraft],
  );

  const validateUnifiedStep = useCallback(
    (step: UnifiedStep): boolean => {
      const nextErrors: UnifiedErrors = {};

      if (step === "kind") {
        if (!["activity", "form", "both"].includes(unifiedKind)) {
          nextErrors.kind = "Selecione o tipo de atribuicao.";
        }
      }

      if (step === "patient") {
        if (activityDraft.patientId.length === 0) {
          nextErrors.patientId = "Selecione um paciente para continuar.";
        }
      }

      if (step === "send" && activityDraft.sendMode === "scheduled") {
        if (!isDateKeyValid(activityDraft.scheduledDateKey)) {
          nextErrors.scheduledDateKey = "Data invalida para agendamento.";
        }
        if (!isTimeValid(activityDraft.scheduledTime)) {
          nextErrors.scheduledTime = "Hora invalida para agendamento.";
        }
        const scheduled = toLocalDate(activityDraft.scheduledDateKey, activityDraft.scheduledTime);
        if (scheduled === null || scheduled.getTime() <= Date.now()) {
          nextErrors.scheduledTime = "O envio agendado precisa estar no futuro.";
        }
      }

      if (step === "due" && shouldHandleActivity(unifiedKind) && !activityDraft.skipDueDate) {
        if (!isDateKeyValid(activityDraft.dueDateKey)) {
          nextErrors.dueDateKey = "Data invalida para prazo.";
        }
        if (!isTimeValid(activityDraft.dueTime)) {
          nextErrors.dueTime = "Hora invalida para prazo.";
        }
      }

      if (step === "note") {
        if (shouldHandleActivity(unifiedKind)) {
          if (activityTemplates.length === 0) {
            nextErrors.activityTemplate = "Crie ao menos um template de atividade antes de atribuir.";
          } else if (activityDraft.templateId.length === 0) {
            nextErrors.activityTemplate = "Selecione um template de atividade.";
          }
        }

        if (shouldHandleForm(unifiedKind)) {
          if (formTemplates.length === 0) {
            nextErrors.formTemplate = "Crie ao menos um template de formulario antes de atribuir.";
          } else if (formDraft.templateId.length === 0) {
            nextErrors.formTemplate = "Selecione um template de formulario.";
          }
        }
      }

      setUnifiedErrors(nextErrors);
      return Object.keys(nextErrors).length === 0;
    },
    [
      activityDraft,
      activityTemplates.length,
      formDraft.templateId,
      formTemplates.length,
      unifiedKind,
    ],
  );

  const submitSessionFlow = useCallback(async () => {
    if (!validateSessionStep("confirm")) {
      return;
    }

    setActiveSubmitMode("session");
    setSessionResult({
      status: "loading",
      title: "Atribuindo sessao",
      message: "Estamos enviando os dados da sessao para o paciente.",
    });
    setSessionStep("result");

    const result = await onAssignSession(sessionDraft);

    if (result.ok) {
      setSessionResult({
        status: "success",
        title: "Sessao atribuida",
        message: result.message,
      });
      return;
    }

    setSessionResult({
      status: "error",
      title: "Falha na atribuicao",
      message: result.message,
    });
  }, [onAssignSession, sessionDraft, validateSessionStep]);

  const submitUnifiedFlow = useCallback(async () => {
    if (!validateUnifiedStep("confirm")) {
      return;
    }

    const note = activityDraft.additionalNote.trim();

    setActiveSubmitMode(shouldHandleActivity(unifiedKind) ? "activity" : "form");
    setUnifiedResult({
      status: "loading",
      title: "Processando atribuicao",
      message:
        unifiedKind === "both"
          ? "Atribuindo atividade e formulario para o paciente selecionado."
          : "Atribuindo item para o paciente selecionado.",
    });
    setUnifiedStep("result");

    let activityResult: AgendaAssignResult | null = null;
    let formResult: AgendaAssignResult | null = null;

    if (shouldHandleActivity(unifiedKind)) {
      activityResult = await onAssignActivity({
        ...activityDraft,
        additionalNote: note,
      });
      if (!activityResult.ok) {
        setUnifiedResult({
          status: "error",
          title: "Falha ao atribuir atividade",
          message: activityResult.message,
        });
        return;
      }
    }

    if (shouldHandleForm(unifiedKind)) {
      formResult = await onAssignForm({
        ...formDraft,
        additionalNote: note,
      });
      if (!formResult.ok) {
        setUnifiedResult({
          status: "error",
          title: "Falha ao atribuir formulario",
          message: formResult.message,
        });
        return;
      }
    }

    const merged =
      activityResult !== null
        ? mergeResult(
            activityResult,
            shouldHandleForm(unifiedKind) ? (formResult ?? { ok: true, message: "" }) : null,
          )
        : formResult ?? { ok: true, message: "Atribuicao concluida." };

    setUnifiedResult({
      status: "success",
      title: "Atribuicao concluida",
      message: merged.message,
    });
  }, [
    activityDraft,
    formDraft,
    onAssignActivity,
    onAssignForm,
    unifiedKind,
    validateUnifiedStep,
  ]);

  const handleBack = useCallback(() => {
    if (flow === "root") {
      onClose();
      return;
    }

    if (flow === "session") {
      if (sessionStep === "patient") {
        setFlow("root");
        resetErrorsForFlow();
        return;
      }
      if (sessionStep === "datetime") {
        setSessionStep("patient");
        return;
      }
      if (sessionStep === "confirm") {
        setSessionStep("datetime");
        return;
      }
      if (sessionStep === "result") {
        if (sessionResult.status === "success") {
          onClose();
          return;
        }
        setSessionStep("confirm");
      }
      return;
    }

    if (unifiedStep === "kind") {
      setFlow("root");
      resetErrorsForFlow();
      return;
    }
    if (unifiedStep === "patient") {
      setUnifiedStep("kind");
      return;
    }
    if (unifiedStep === "send") {
      setUnifiedStep("patient");
      return;
    }
    if (unifiedStep === "due") {
      setUnifiedStep("send");
      return;
    }
    if (unifiedStep === "note") {
      setUnifiedStep("due");
      return;
    }
    if (unifiedStep === "confirm") {
      setUnifiedStep("note");
      return;
    }
    if (unifiedStep === "result") {
      if (unifiedResult.status === "success") {
        onClose();
        return;
      }
      setUnifiedStep("confirm");
    }
  }, [
    flow,
    onClose,
    resetErrorsForFlow,
    sessionResult.status,
    sessionStep,
    unifiedResult.status,
    unifiedStep,
  ]);

  const handleNext = useCallback(() => {
    if (flow === "root") {
      return;
    }

    if (flow === "session") {
      if (sessionStep === "patient") {
        if (!validateSessionStep("patient")) {
          return;
        }
        setSessionStep("datetime");
        return;
      }
      if (sessionStep === "datetime") {
        if (!validateSessionStep("datetime")) {
          return;
        }
        setSessionStep("confirm");
        return;
      }
      if (sessionStep === "confirm") {
        void submitSessionFlow();
        return;
      }
      if (sessionStep === "result") {
        if (sessionResult.status === "success") {
          onClose();
          return;
        }
        setSessionStep("confirm");
      }
      return;
    }

    if (unifiedStep === "kind") {
      if (!validateUnifiedStep("kind")) {
        return;
      }
      setUnifiedStep("patient");
      return;
    }
    if (unifiedStep === "patient") {
      if (!validateUnifiedStep("patient")) {
        return;
      }
      setUnifiedStep("send");
      return;
    }
    if (unifiedStep === "send") {
      if (!validateUnifiedStep("send")) {
        return;
      }
      setUnifiedStep("due");
      return;
    }
    if (unifiedStep === "due") {
      if (!validateUnifiedStep("due")) {
        return;
      }
      setUnifiedStep("note");
      return;
    }
    if (unifiedStep === "note") {
      if (!validateUnifiedStep("note")) {
        return;
      }
      setUnifiedStep("confirm");
      return;
    }
    if (unifiedStep === "confirm") {
      void submitUnifiedFlow();
      return;
    }
    if (unifiedStep === "result") {
      if (unifiedResult.status === "success") {
        onClose();
        return;
      }
      setUnifiedStep("confirm");
    }
  }, [
    flow,
    onClose,
    sessionResult.status,
    sessionStep,
    submitSessionFlow,
    submitUnifiedFlow,
    unifiedResult.status,
    unifiedStep,
    validateSessionStep,
    validateUnifiedStep,
  ]);

  const headerTitle = useMemo(() => {
    if (flow === "root") {
      return "Acoes da agenda";
    }
    if (flow === "session") {
      return "Atribuir sessao";
    }
    return "Atribuicao guiada";
  }, [flow]);

  const stepLabel = useMemo(() => {
    if (flow === "session") {
      const total = SESSION_STEPS.length;
      const current = sessionStep === "result" ? total : SESSION_STEPS.indexOf(sessionStep) + 1;
      return `${current}/${total}`;
    }
    if (flow === "unified") {
      const total = UNIFIED_STEPS.length;
      const current = unifiedStep === "result" ? total : UNIFIED_STEPS.indexOf(unifiedStep) + 1;
      return `${current}/${total}`;
    }
    return null;
  }, [flow, sessionStep, unifiedStep]);

  const primaryButtonLabel = useMemo(() => {
    if (flow === "root") {
      return "";
    }

    if (flow === "session") {
      if (sessionStep === "confirm") {
        return submitLabel("session", loadingCurrentMode || sessionResult.status === "loading");
      }
      if (sessionStep === "result") {
        return sessionResult.status === "success" ? "Concluir" : "Tentar novamente";
      }
      return "Continuar";
    }

    if (unifiedStep === "confirm") {
      if (unifiedKind === "activity") {
        return submitLabel("activity", loadingCurrentMode || unifiedResult.status === "loading");
      }
      if (unifiedKind === "form") {
        return submitLabel("form", loadingCurrentMode || unifiedResult.status === "loading");
      }
      return loadingCurrentMode || unifiedResult.status === "loading"
        ? "Atribuindo atividade e formulario..."
        : "Confirmar atribuicao";
    }

    if (unifiedStep === "result") {
      return unifiedResult.status === "success" ? "Concluir" : "Tentar novamente";
    }

    return "Continuar";
  }, [
    flow,
    loadingCurrentMode,
    sessionResult.status,
    sessionStep,
    unifiedKind,
    unifiedResult.status,
    unifiedStep,
  ]);

  const secondaryButtonLabel = useMemo(() => {
    if (flow === "root") {
      return "Fechar";
    }
    return "Voltar";
  }, [flow]);

  const showPatientSearch = useMemo(
    () =>
      (flow === "session" && sessionStep === "patient") ||
      (flow === "unified" && unifiedStep === "patient"),
    [flow, sessionStep, unifiedStep],
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
      return candidates.some((candidate) =>
        normalizeTextSearch(candidate).includes(query),
      );
    });
  }, [patientSearchText, patients]);

  if (!mounted) {
    return null;
  }

  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.modalOverlay, { opacity: overlayOpacity }]}>
        <Pressable style={styles.modalBackdropTapZone} onPress={onClose} />
        <Animated.View
          style={[
            styles.modalCard,
            {
              opacity: overlayOpacity,
              transform: [{ translateY: modalTranslateY }, { scale: modalScale }],
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{headerTitle}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar modal da agenda"
              onPress={onClose}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close-outline" size={18} color="#344054" />
            </Pressable>
          </View>

          {stepLabel || showPatientSearch ? (
            <View style={styles.metaRow}>
              {stepLabel ? <StepTag value={`Etapa ${stepLabel}`} /> : <View style={styles.stepTagPlaceholder} />}
              {showPatientSearch ? (
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
                    testID="agenda-assign-patient-search"
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          <Animated.View
            style={[
              styles.body,
              {
                opacity: stepMotion,
                transform: [
                  {
                    translateX: stepMotion.interpolate({
                      inputRange: [0, 1],
                      outputRange: [22, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollBodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {flow === "root" ? (
                <>
                  <View style={styles.modalSection}>
                    <Text style={styles.stepTitle}>O que deseja fazer na agenda agora?</Text>
                    <Text style={styles.stepDescription}>
                      Escolha um fluxo guiado para manter atribuicoes claras e sem telas empilhadas.
                    </Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setFlow("session");
                      setSessionStep("patient");
                      setSessionResult({ status: "idle", title: "", message: null });
                      resetErrorsForFlow();
                    }}
                    style={styles.flowCard}
                  >
                    <View style={styles.flowCardIconWrap}>
                      <Ionicons name="calendar-outline" size={18} color="#0369A1" />
                    </View>
                    <View style={styles.flowCardBody}>
                      <Text style={styles.flowCardTitle}>Atribuir sessao</Text>
                      <Text style={styles.flowCardText}>
                        Fluxo em 3 etapas: paciente, data/horario e confirmacao final.
                      </Text>
                    </View>
                  </Pressable>

                  {enableUnifiedFlow ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setFlow("unified");
                        setUnifiedStep("kind");
                        setUnifiedResult({ status: "idle", title: "", message: null });
                        resetErrorsForFlow();
                      }}
                      style={styles.flowCard}
                    >
                      <View style={styles.flowCardIconWrap}>
                        <Ionicons name="layers-outline" size={18} color="#7C3AED" />
                      </View>
                      <View style={styles.flowCardBody}>
                        <Text style={styles.flowCardTitle}>Atribuicao unificada</Text>
                        <Text style={styles.flowCardText}>
                          Atividade, formulario ou os dois, com navegacao guiada no mesmo modal.
                        </Text>
                      </View>
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              {flow === "session" && sessionStep === "patient" ? (
                <View style={[styles.modalSection, styles.modalSectionFlat]}>
                  <Text style={styles.stepTitle}>Deseja atribuir a sessao a qual paciente?</Text>
                  <Text style={styles.stepDescription}>
                    Selecao individual para manter rastreabilidade e evitar atribuicoes em lote.
                  </Text>
                  <PatientCards
                    patients={filteredPatients}
                    selectedPatientId={sessionDraft.patientId}
                    onSelect={(patientId) =>
                      setSessionDraft((current) => ({ ...current, patientId }))
                    }
                    testIdPrefix="agenda-assign-session-patient"
                  />
                  <FieldError message={sessionErrors.patientId} />
                </View>
              ) : null}

              {flow === "session" && sessionStep === "datetime" ? (
                <View style={styles.modalSection}>
                  <Text style={styles.stepTitle}>Qual a data e o horario da sessao?</Text>
                  <TextInput
                    testID="agenda-assign-session-date"
                    value={sessionDraft.dateKey}
                    onChangeText={(value) =>
                      setSessionDraft((current) => ({ ...current, dateKey: value }))
                    }
                    placeholder="Data (YYYY-MM-DD)"
                    placeholderTextColor="#98A2B3"
                    style={styles.input}
                    autoCapitalize="none"
                  />
                  <FieldError message={sessionErrors.dateKey} />
                  <View style={styles.inlineInputRow}>
                    <View style={styles.inlineInputCell}>
                      <TextInput
                        testID="agenda-assign-session-start"
                        value={sessionDraft.startTime}
                        onChangeText={(value) =>
                          setSessionDraft((current) => ({ ...current, startTime: value }))
                        }
                        placeholder="Inicio (HH:mm)"
                        placeholderTextColor="#98A2B3"
                        style={styles.input}
                        autoCapitalize="none"
                      />
                      <FieldError message={sessionErrors.startTime} />
                    </View>
                    <View style={styles.inlineInputCell}>
                      <TextInput
                        testID="agenda-assign-session-end"
                        value={sessionDraft.endTime}
                        onChangeText={(value) =>
                          setSessionDraft((current) => ({ ...current, endTime: value }))
                        }
                        placeholder="Fim (HH:mm)"
                        placeholderTextColor="#98A2B3"
                        style={styles.input}
                        autoCapitalize="none"
                      />
                      <FieldError message={sessionErrors.endTime} />
                    </View>
                  </View>
                  <TextInput
                    testID="agenda-assign-session-notes"
                    value={sessionDraft.notes}
                    onChangeText={(value) =>
                      setSessionDraft((current) => ({ ...current, notes: value }))
                    }
                    placeholder="Algum recado extra? (opcional)"
                    placeholderTextColor="#98A2B3"
                    style={[styles.input, styles.notesInput]}
                    multiline
                  />
                </View>
              ) : null}

              {flow === "session" && sessionStep === "confirm" ? (
                <View style={styles.modalSection}>
                  <Text style={styles.stepTitle}>Confirmar atribuicao da sessao</Text>
                  <Text style={styles.confirmRow}>
                    Paciente: <Text style={styles.confirmStrong}>{patients.find((item) => item.id === sessionDraft.patientId)?.fullName ?? "Nao informado"}</Text>
                  </Text>
                  <Text style={styles.confirmRow}>
                    Data: <Text style={styles.confirmStrong}>{sessionDraft.dateKey}</Text>
                  </Text>
                  <Text style={styles.confirmRow}>
                    Horario: <Text style={styles.confirmStrong}>{sessionDraft.startTime} - {sessionDraft.endTime}</Text>
                  </Text>
                  <Text style={styles.confirmRow}>
                    Recado: <Text style={styles.confirmStrong}>{sessionDraft.notes.trim().length > 0 ? sessionDraft.notes.trim() : "Sem recado extra"}</Text>
                  </Text>
                </View>
              ) : null}

              {flow === "session" && sessionStep === "result" ? (
                <LocalResultPanel
                  status={sessionResult.status}
                  title={sessionResult.title}
                  message={sessionResult.message ?? backendErrorMessage}
                  motion={resultMotion}
                />
              ) : null}

              {flow === "unified" && unifiedStep === "kind" ? (
                <View style={styles.modalSection}>
                  <Text style={styles.stepTitle}>
                    Deseja atribuir uma atividade, um formulario ou os dois?
                  </Text>
                  <Text style={styles.stepDescription}>
                    O fluxo segue padrao unico do inicio ao fim, sem menus empilhados.
                  </Text>
                  <View style={styles.modeRow}>
                    {([
                      ["activity", "Atividade"],
                      ["form", "Formulario"],
                      ["both", "Os dois"],
                    ] as const).map(([value, label]) => (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        onPress={() => setUnifiedKind(value)}
                        style={[styles.modeButton, unifiedKind === value ? styles.modeButtonActive : null]}
                      >
                        <Text
                          style={[
                            styles.modeButtonText,
                            unifiedKind === value ? styles.modeButtonTextActive : null,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <FieldError message={unifiedErrors.kind} />
                </View>
              ) : null}

              {flow === "unified" && unifiedStep === "patient" ? (
                <View style={[styles.modalSection, styles.modalSectionFlat]}>
                  <Text style={styles.stepTitle}>Deseja atribuir a qual paciente?</Text>
                  <Text style={styles.stepDescription}>
                    Selecao unica obrigatoria para manter o contrato de design da aplicacao.
                  </Text>
                  <PatientCards
                    patients={filteredPatients}
                    selectedPatientId={activityDraft.patientId}
                    onSelect={handleSelectPatientForUnified}
                    testIdPrefix="agenda-assign-unified-patient"
                  />
                  <FieldError message={unifiedErrors.patientId} />
                </View>
              ) : null}

              {flow === "unified" && unifiedStep === "send" ? (
                <View style={styles.modalSection}>
                  <Text style={styles.stepTitle}>Devemos enviar agora ou agendar?</Text>
                  <View style={styles.modeRow}>
                    <Pressable
                      accessibilityRole="button"
                      testID="agenda-assign-unified-send-immediate"
                      onPress={() => handleSendModeChange("immediate")}
                      style={[
                        styles.modeButton,
                        activityDraft.sendMode === "immediate" ? styles.modeButtonActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeButtonText,
                          activityDraft.sendMode === "immediate" ? styles.modeButtonTextActive : null,
                        ]}
                      >
                        Enviar agora
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      testID="agenda-assign-unified-send-scheduled"
                      onPress={() => handleSendModeChange("scheduled")}
                      style={[
                        styles.modeButton,
                        activityDraft.sendMode === "scheduled" ? styles.modeButtonActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeButtonText,
                          activityDraft.sendMode === "scheduled" ? styles.modeButtonTextActive : null,
                        ]}
                      >
                        Agendar envio
                      </Text>
                    </Pressable>
                  </View>

                  {activityDraft.sendMode === "scheduled" ? (
                    <>
                      <View style={styles.inlineInputRow}>
                        <View style={styles.inlineInputCell}>
                          <TextInput
                            value={activityDraft.scheduledDateKey}
                            onChangeText={handleScheduledDateChange}
                            placeholder="Data envio (YYYY-MM-DD)"
                            testID="agenda-assign-unified-scheduled-date"
                            placeholderTextColor="#98A2B3"
                            style={styles.input}
                            autoCapitalize="none"
                          />
                          <FieldError message={unifiedErrors.scheduledDateKey} />
                        </View>
                        <View style={styles.inlineInputCell}>
                          <TextInput
                            value={activityDraft.scheduledTime}
                            onChangeText={handleScheduledTimeChange}
                            placeholder="Hora envio (HH:mm)"
                            testID="agenda-assign-unified-scheduled-time"
                            placeholderTextColor="#98A2B3"
                            style={styles.input}
                            autoCapitalize="none"
                          />
                          <FieldError message={unifiedErrors.scheduledTime} />
                        </View>
                      </View>
                    </>
                  ) : null}
                </View>
              ) : null}

              {flow === "unified" && unifiedStep === "due" ? (
                <View style={styles.modalSection}>
                  {shouldHandleActivity(unifiedKind) ? (
                    <>
                      <Text style={styles.stepTitle}>Quer definir um prazo para a atividade?</Text>
                      <View style={styles.modeRow}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            setActivityDraft((current) => ({ ...current, skipDueDate: false }))
                          }
                          style={[
                            styles.modeButton,
                            !activityDraft.skipDueDate ? styles.modeButtonActive : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.modeButtonText,
                              !activityDraft.skipDueDate ? styles.modeButtonTextActive : null,
                            ]}
                          >
                            Sim
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            setActivityDraft((current) => ({ ...current, skipDueDate: true }))
                          }
                          style={[
                            styles.modeButton,
                            activityDraft.skipDueDate ? styles.modeButtonActive : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.modeButtonText,
                              activityDraft.skipDueDate ? styles.modeButtonTextActive : null,
                            ]}
                          >
                            Nao
                          </Text>
                        </Pressable>
                      </View>

                      {!activityDraft.skipDueDate ? (
                        <View style={styles.inlineInputRow}>
                          <View style={styles.inlineInputCell}>
                            <TextInput
                              value={activityDraft.dueDateKey}
                              onChangeText={(value) =>
                                setActivityDraft((current) => ({ ...current, dueDateKey: value }))
                              }
                              placeholder="Data prazo (YYYY-MM-DD)"
                              testID="agenda-assign-unified-due-date"
                              placeholderTextColor="#98A2B3"
                              style={styles.input}
                              autoCapitalize="none"
                            />
                            <FieldError message={unifiedErrors.dueDateKey} />
                          </View>
                          <View style={styles.inlineInputCell}>
                            <TextInput
                              value={activityDraft.dueTime}
                              onChangeText={(value) =>
                                setActivityDraft((current) => ({ ...current, dueTime: value }))
                              }
                              placeholder="Hora prazo (HH:mm)"
                              testID="agenda-assign-unified-due-time"
                              placeholderTextColor="#98A2B3"
                              style={styles.input}
                              autoCapitalize="none"
                            />
                            <FieldError message={unifiedErrors.dueTime} />
                          </View>
                        </View>
                      ) : (
                        <Text style={styles.helperText}>
                          Sem prazo manual: o sistema aplica um prazo tecnico padrao para manter o contrato da API.
                        </Text>
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={styles.stepTitle}>Fluxo sem etapa de prazo</Text>
                      <Text style={styles.stepDescription}>
                        Como voce selecionou apenas formulario, esta etapa segue automaticamente.
                      </Text>
                    </>
                  )}
                </View>
              ) : null}

              {flow === "unified" && unifiedStep === "note" ? (
                <View style={styles.modalSection}>
                  <Text style={styles.stepTitle}>Algum recado extra?</Text>
                  <TextInput
                    value={activityDraft.additionalNote}
                    onChangeText={(value) => {
                      setActivityDraft((current) => ({ ...current, additionalNote: value }));
                      setFormDraft((current) => ({ ...current, additionalNote: value }));
                    }}
                    placeholder="Observacao complementar opcional"
                    testID="agenda-assign-unified-additional-note"
                    placeholderTextColor="#98A2B3"
                    style={[styles.input, styles.notesInput]}
                    multiline
                  />

                  {shouldHandleActivity(unifiedKind) ? (
                    <View style={styles.templateSection}>
                      <Text style={styles.modalLabel}>Template de atividade</Text>
                      {loadingTemplates ? <Text style={styles.helperText}>Carregando templates...</Text> : null}
                      {activityTemplates.length === 0 ? (
                        <View style={styles.emptyState}>
                          <Text style={styles.emptyStateText}>Nenhum template de atividade encontrado.</Text>
                          <Pressable
                            accessibilityRole="button"
                            onPress={onOpenActivitiesTemplates}
                            style={styles.secondaryCtaButton}
                            testID="agenda-assign-open-activity-templates"
                          >
                            <Text style={styles.secondaryCtaButtonText}>Criar template de atividade</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <View style={styles.templateListWrap}>
                          {activityTemplates.map((item) => {
                            const active = item.id === activityDraft.templateId;
                            return (
                              <Pressable
                                key={item.id}
                                accessibilityRole="button"
                                onPress={() =>
                                  setActivityDraft((current) => ({ ...current, templateId: item.id }))
                                }
                                style={[styles.templateCard, active ? styles.templateCardActive : null]}
                              >
                                <Text style={[styles.templateTitle, active ? styles.templateTitleActive : null]}>
                                  {item.title}
                                </Text>
                                <Text style={styles.templateMeta}>Tipo: {item.activityType}</Text>
                                <Text style={styles.templateMeta}>
                                  {truncateValue(item.instructions ?? item.description, 100)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                      <FieldError message={unifiedErrors.activityTemplate} />
                    </View>
                  ) : null}

                  {shouldHandleForm(unifiedKind) ? (
                    <View style={styles.templateSection}>
                      <Text style={styles.modalLabel}>Template de formulario</Text>
                      {loadingTemplates ? <Text style={styles.helperText}>Carregando templates...</Text> : null}
                      {formTemplates.length === 0 ? (
                        <View style={styles.emptyState}>
                          <Text style={styles.emptyStateText}>Nenhum template de formulario encontrado.</Text>
                          <Pressable
                            accessibilityRole="button"
                            onPress={onOpenFormTemplates}
                            style={styles.secondaryCtaButton}
                            testID="agenda-assign-open-form-templates"
                          >
                            <Text style={styles.secondaryCtaButtonText}>Criar template de formulario</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <View style={styles.templateListWrap}>
                          {formTemplates.map((item) => {
                            const active = item.id === formDraft.templateId;
                            return (
                              <Pressable
                                key={item.id}
                                accessibilityRole="button"
                                onPress={() =>
                                  setFormDraft((current) => ({ ...current, templateId: item.id }))
                                }
                                style={[styles.templateCard, active ? styles.templateCardActive : null]}
                              >
                                <Text style={[styles.templateTitle, active ? styles.templateTitleActive : null]}>
                                  {item.title}
                                </Text>
                                <Text style={styles.templateMeta}>{truncateValue(item.subtitle, 100)}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                      <FieldError message={unifiedErrors.formTemplate} />
                    </View>
                  ) : null}
                </View>
              ) : null}

              {flow === "unified" && unifiedStep === "confirm" ? (
                <View style={styles.modalSection}>
                  <Text style={styles.stepTitle}>Confirmar atribuicao</Text>
                  <Text style={styles.confirmRow}>
                    Tipo: <Text style={styles.confirmStrong}>{unifiedKindLabel(unifiedKind)}</Text>
                  </Text>
                  <Text style={styles.confirmRow}>
                    Paciente: <Text style={styles.confirmStrong}>{patients.find((item) => item.id === activityDraft.patientId)?.fullName ?? "Nao informado"}</Text>
                  </Text>
                  <Text style={styles.confirmRow}>
                    Envio: <Text style={styles.confirmStrong}>{activityDraft.sendMode === "immediate" ? "Agora" : `${activityDraft.scheduledDateKey} ${activityDraft.scheduledTime}`}</Text>
                  </Text>
                  {shouldHandleActivity(unifiedKind) ? (
                    <Text style={styles.confirmRow}>
                      Prazo atividade: <Text style={styles.confirmStrong}>{activityDraft.skipDueDate ? "Sem prazo manual" : `${activityDraft.dueDateKey} ${activityDraft.dueTime}`}</Text>
                    </Text>
                  ) : null}
                  {shouldHandleActivity(unifiedKind) ? (
                    <Text style={styles.confirmRow}>
                      Template atividade: <Text style={styles.confirmStrong}>{selectedActivityTemplate?.title ?? "Nao selecionado"}</Text>
                    </Text>
                  ) : null}
                  {shouldHandleForm(unifiedKind) ? (
                    <Text style={styles.confirmRow}>
                      Template formulario: <Text style={styles.confirmStrong}>{selectedFormTemplate?.title ?? "Nao selecionado"}</Text>
                    </Text>
                  ) : null}
                  <Text style={styles.confirmRow}>
                    Recado extra: <Text style={styles.confirmStrong}>{activityDraft.additionalNote.trim().length > 0 ? activityDraft.additionalNote.trim() : "Sem recado extra"}</Text>
                  </Text>
                </View>
              ) : null}

              {flow === "unified" && unifiedStep === "result" ? (
                <LocalResultPanel
                  status={unifiedResult.status}
                  title={unifiedResult.title}
                  message={unifiedResult.message ?? backendErrorMessage}
                  motion={resultMotion}
                />
              ) : null}

              {backendErrorMessage && flow !== "root" ? (
                <Text style={styles.errorText}>{backendErrorMessage}</Text>
              ) : null}
            </ScrollView>
          </Animated.View>

          <View style={styles.footerRow}>
            <Pressable
              accessibilityRole="button"
              onPress={handleBack}
              style={[
                styles.secondaryButton,
                loadingCurrentMode || isLocalSubmitting ? styles.secondaryButtonDisabled : null,
              ]}
              disabled={loadingCurrentMode || isLocalSubmitting}
            >
              <Text style={styles.secondaryButtonText}>{secondaryButtonLabel}</Text>
            </Pressable>

            {flow !== "root" ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleNext}
                style={[
                  styles.submitButton,
                  loadingCurrentMode || isLocalSubmitting ? styles.submitButtonDisabled : null,
                ]}
                disabled={loadingCurrentMode || isLocalSubmitting}
                testID="agenda-assign-submit"
              >
                <Text style={styles.submitButtonText}>{primaryButtonLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    width: agendaModalContract.widthPercent,
    maxWidth: agendaModalContract.maxWidth,
    borderRadius: agendaModalContract.borderRadius,
    backgroundColor: "#FFFFFF",
    borderWidth: agendaModalContract.borderWidth,
    borderColor: agendaModalContract.borderColor,
    paddingHorizontal: agendaModalContract.paddingHorizontal,
    paddingVertical: agendaModalContract.paddingVertical,
    marginBottom: agendaModalContract.marginBottom,
    gap: agendaModalContract.contentGap,
    shadowColor: "#0F172A",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 10,
    height: agendaModalContract.fixedHeight,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: agendaModalContract.headerGap,
  },
  modalTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 17,
    lineHeight: 24,
    fontWeight: typographyContract.fontWeight,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F4F7",
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
    fontFamily: typographyContract.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: "#344054",
    fontWeight: typographyContract.fontWeight,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 28,
    paddingHorizontal: 2,
  },
  stepTagPlaceholder: {
    minWidth: 82,
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
    borderRadius: agendaModalContract.sectionRadius,
    borderWidth: 1,
    borderColor: agendaModalContract.sectionBorderColor,
    paddingHorizontal: agendaModalContract.sectionPaddingHorizontal,
    paddingVertical: agendaModalContract.sectionPaddingVertical,
    gap: agendaModalContract.sectionGap,
    backgroundColor: "#FFFFFF",
  },
  modalSectionFlat: {
    borderWidth: 0,
    backgroundColor: "transparent",
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
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
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
  },
  modeButtonActive: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF3",
  },
  modeButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    fontWeight: typographyContract.fontWeight,
  },
  modeButtonTextActive: {
    color: "#065F46",
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
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    minHeight: 40,
    paddingHorizontal: 10,
    color: "#101828",
    fontFamily: typographyContract.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
    backgroundColor: "#FFFFFF",
  },
  notesInput: {
    minHeight: 78,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  inlineInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  inlineInputCell: {
    flex: 1,
    gap: 4,
  },
  templateSection: {
    gap: 8,
  },
  modalLabel: {
    fontFamily: typographyContract.fontFamily,
    color: "#344054",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  templateListWrap: {
    gap: 8,
  },
  templateCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 9,
    paddingVertical: 9,
    gap: 3,
  },
  templateCardActive: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF3",
  },
  templateTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  templateTitleActive: {
    color: "#065F46",
  },
  templateMeta: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  emptyState: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EAECF0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  emptyStateText: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
  secondaryCtaButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF3",
    minHeight: 34,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  secondaryCtaButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#065F46",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  confirmRow: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  confirmStrong: {
    color: "#101828",
  },
  flowCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  flowCardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E4E7EC",
  },
  flowCardBody: {
    flex: 1,
    gap: 2,
  },
  flowCardTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  flowCardText: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  footerRow: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F4F7",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#D0D5DD",
  },
  secondaryButtonDisabled: {
    opacity: 0.55,
  },
  secondaryButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#344054",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  submitButton: {
    flex: 1.6,
    minHeight: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
    paddingHorizontal: 12,
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  fieldErrorText: {
    fontFamily: typographyContract.fontFamily,
    color: "#B42318",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  errorText: {
    fontFamily: typographyContract.fontFamily,
    color: "#B42318",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
  resultCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EAECF0",
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
  },
  resultIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  resultTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
    fontWeight: typographyContract.fontWeight,
  },
  resultMessage: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 12.5,
    lineHeight: 17,
    textAlign: "center",
    fontWeight: typographyContract.fontWeight,
  },
});
