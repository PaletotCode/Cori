import type {
  ActivityTemplateListItem,
  TemplateSendMode as ActivityTemplateSendMode,
} from "../../../activities/api/types";
import type {
  FormTemplateListItem,
  TemplateSendMode as FormTemplateSendMode,
} from "../../../forms/api/types";
import type { PatientListItem } from "../../../patients/api/types";

export type AgendaAssignMode = "session" | "activity" | "form";

export type AgendaAssignFlowStatus = "idle" | "loading" | "success" | "error";

export interface AgendaAssignResult {
  ok: boolean;
  message: string;
}

export interface AssignSessionDraft {
  patientId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  notes: string;
}

export interface AssignActivityDraft {
  templateId: string;
  patientId: string;
  sendMode: ActivityTemplateSendMode;
  scheduledDateKey: string;
  scheduledTime: string;
  dueDateKey: string;
  dueTime: string;
  skipDueDate: boolean;
  additionalNote: string;
}

export interface AssignFormDraft {
  templateId: string;
  patientId: string;
  sendMode: FormTemplateSendMode;
  scheduledDateKey: string;
  scheduledTime: string;
  additionalNote: string;
}

export interface AgendaAssignSheetProps {
  visible: boolean;
  selectedDateKey: string;
  patients: PatientListItem[];
  activityTemplates: ActivityTemplateListItem[];
  formTemplates: FormTemplateListItem[];
  loadingTemplates: boolean;
  flowStatusByMode: Record<AgendaAssignMode, AgendaAssignFlowStatus>;
  errorMessageByMode: Partial<Record<AgendaAssignMode, string | null>>;
  onClose: () => void;
  onAssignSession: (draft: AssignSessionDraft) => Promise<AgendaAssignResult>;
  onAssignActivity: (draft: AssignActivityDraft) => Promise<AgendaAssignResult>;
  onAssignForm: (draft: AssignFormDraft) => Promise<AgendaAssignResult>;
  onOpenActivitiesTemplates: () => void;
  onOpenFormTemplates: () => void;
}
