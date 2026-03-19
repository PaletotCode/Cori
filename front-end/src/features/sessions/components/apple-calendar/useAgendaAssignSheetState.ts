import { useCallback, useEffect, useMemo, useState } from "react";

import type { ActivityTemplateListItem } from "../../../activities/api/types";
import type { FormTemplateListItem } from "../../../forms/api/types";
import type { PatientListItem } from "../../../patients/api/types";
import type {
  AgendaAssignMode,
  AssignActivityDraft,
  AssignFormDraft,
  AssignSessionDraft,
} from "./AgendaAssignSheet.types";

interface SessionFieldErrors {
  patientId?: string;
  dateKey?: string;
  startTime?: string;
  endTime?: string;
}

interface ActivityFieldErrors {
  templateId?: string;
  patientId?: string;
  dueDateKey?: string;
  dueTime?: string;
  scheduledDateKey?: string;
  scheduledTime?: string;
}

interface FormFieldErrors {
  templateId?: string;
  patientId?: string;
  scheduledDateKey?: string;
  scheduledTime?: string;
}

export interface UseAgendaAssignSheetStateArgs {
  visible: boolean;
  selectedDateKey: string;
  patients: PatientListItem[];
  activityTemplates: ActivityTemplateListItem[];
  formTemplates: FormTemplateListItem[];
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

function toLocalDate(dateKey: string, time: string): Date | null {
  if (!isDateKeyValid(dateKey) || !isTimeValid(time)) {
    return null;
  }
  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  const [hourRaw, minuteRaw] = time.split(":");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function useAgendaAssignSheetState({
  visible,
  selectedDateKey,
  patients,
  activityTemplates,
  formTemplates,
}: UseAgendaAssignSheetStateArgs) {
  const [mode, setMode] = useState<AgendaAssignMode>("session");

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

  const [sessionErrors, setSessionErrors] = useState<SessionFieldErrors>({});
  const [activityErrors, setActivityErrors] = useState<ActivityFieldErrors>({});
  const [formErrors, setFormErrors] = useState<FormFieldErrors>({});

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSessionDraft((current) => ({
      ...current,
      dateKey: selectedDateKey,
      patientId: current.patientId.length > 0 ? current.patientId : (patients[0]?.id ?? ""),
    }));
    setActivityDraft((current) => ({
      ...current,
      patientId: current.patientId.length > 0 ? current.patientId : (patients[0]?.id ?? ""),
      templateId:
        current.templateId.length > 0 ? current.templateId : (activityTemplates[0]?.id ?? ""),
      scheduledDateKey: selectedDateKey,
      dueDateKey: selectedDateKey,
    }));
    setFormDraft((current) => ({
      ...current,
      patientId: current.patientId.length > 0 ? current.patientId : (patients[0]?.id ?? ""),
      templateId: current.templateId.length > 0 ? current.templateId : (formTemplates[0]?.id ?? ""),
      scheduledDateKey: selectedDateKey,
    }));
    setSessionErrors({});
    setActivityErrors({});
    setFormErrors({});
  }, [activityTemplates, formTemplates, patients, selectedDateKey, visible]);

  useEffect(() => {
    if (!visible || activityTemplates.length === 0) {
      return;
    }
    setActivityDraft((current) => {
      if (activityTemplates.some((item) => item.id === current.templateId)) {
        return current;
      }
      return {
        ...current,
        templateId: activityTemplates[0].id,
      };
    });
  }, [activityTemplates, visible]);

  useEffect(() => {
    if (!visible || formTemplates.length === 0) {
      return;
    }
    setFormDraft((current) => {
      if (formTemplates.some((item) => item.id === current.templateId)) {
        return current;
      }
      return {
        ...current,
        templateId: formTemplates[0].id,
      };
    });
  }, [formTemplates, visible]);

  useEffect(() => {
    if (!visible || patients.length === 0) {
      return;
    }
    setSessionDraft((current) => {
      if (patients.some((item) => item.id === current.patientId)) {
        return current;
      }
      return {
        ...current,
        patientId: patients[0].id,
      };
    });
    setActivityDraft((current) => {
      if (patients.some((item) => item.id === current.patientId)) {
        return current;
      }
      return {
        ...current,
        patientId: patients[0].id,
      };
    });
    setFormDraft((current) => {
      if (patients.some((item) => item.id === current.patientId)) {
        return current;
      }
      return {
        ...current,
        patientId: patients[0].id,
      };
    });
  }, [patients, visible]);

  const selectedActivityTemplate = useMemo(
    () => activityTemplates.find((item) => item.id === activityDraft.templateId) ?? null,
    [activityDraft.templateId, activityTemplates],
  );

  const selectedFormTemplate = useMemo(
    () => formTemplates.find((item) => item.id === formDraft.templateId) ?? null,
    [formDraft.templateId, formTemplates],
  );

  const validateSession = useCallback((): boolean => {
    const nextErrors: SessionFieldErrors = {};
    if (sessionDraft.patientId.length === 0) {
      nextErrors.patientId = "Selecione um paciente.";
    }
    if (!isDateKeyValid(sessionDraft.dateKey)) {
      nextErrors.dateKey = "Data invalida. Use o formato YYYY-MM-DD.";
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
  }, [sessionDraft]);

  const validateActivity = useCallback((): boolean => {
    const nextErrors: ActivityFieldErrors = {};
    if (activityDraft.templateId.length === 0) {
      nextErrors.templateId = "Selecione um template de atividade.";
    }
    if (activityDraft.patientId.length === 0) {
      nextErrors.patientId = "Selecione um paciente.";
    }
    if (!activityDraft.skipDueDate) {
      if (!isDateKeyValid(activityDraft.dueDateKey)) {
        nextErrors.dueDateKey = "Data invalida para prazo.";
      }
      if (!isTimeValid(activityDraft.dueTime)) {
        nextErrors.dueTime = "Hora invalida para prazo.";
      }
    }
    if (activityDraft.sendMode === "scheduled") {
      if (!isDateKeyValid(activityDraft.scheduledDateKey)) {
        nextErrors.scheduledDateKey = "Data invalida para envio.";
      }
      if (!isTimeValid(activityDraft.scheduledTime)) {
        nextErrors.scheduledTime = "Hora invalida para envio.";
      }
      const scheduled = toLocalDate(activityDraft.scheduledDateKey, activityDraft.scheduledTime);
      if (scheduled === null || scheduled.getTime() <= Date.now()) {
        nextErrors.scheduledTime = "Envio agendado precisa estar no futuro.";
      }
    }
    setActivityErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [activityDraft]);

  const validateForm = useCallback((): boolean => {
    const nextErrors: FormFieldErrors = {};
    if (formDraft.templateId.length === 0) {
      nextErrors.templateId = "Selecione um template de formulario.";
    }
    if (formDraft.patientId.length === 0) {
      nextErrors.patientId = "Selecione um paciente.";
    }
    if (formDraft.sendMode === "scheduled") {
      if (!isDateKeyValid(formDraft.scheduledDateKey)) {
        nextErrors.scheduledDateKey = "Data invalida para envio.";
      }
      if (!isTimeValid(formDraft.scheduledTime)) {
        nextErrors.scheduledTime = "Hora invalida para envio.";
      }
      const scheduled = toLocalDate(formDraft.scheduledDateKey, formDraft.scheduledTime);
      if (scheduled === null || scheduled.getTime() <= Date.now()) {
        nextErrors.scheduledTime = "Envio agendado precisa estar no futuro.";
      }
    }
    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [formDraft]);

  const validateCurrentMode = useCallback((): boolean => {
    if (mode === "session") {
      return validateSession();
    }
    if (mode === "activity") {
      return validateActivity();
    }
    return validateForm();
  }, [mode, validateActivity, validateForm, validateSession]);

  const resetModeError = useCallback((nextMode: AgendaAssignMode) => {
    if (nextMode === "session") {
      setSessionErrors({});
      return;
    }
    if (nextMode === "activity") {
      setActivityErrors({});
      return;
    }
    setFormErrors({});
  }, []);

  return {
    mode,
    setMode: (nextMode: AgendaAssignMode) => {
      setMode(nextMode);
      resetModeError(nextMode);
    },
    sessionDraft,
    setSessionDraft,
    activityDraft,
    setActivityDraft,
    formDraft,
    setFormDraft,
    sessionErrors,
    activityErrors,
    formErrors,
    validateCurrentMode,
    selectedActivityTemplate,
    selectedFormTemplate,
  };
}
