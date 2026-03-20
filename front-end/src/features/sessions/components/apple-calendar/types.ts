export type AppleCalendarScope = "year" | "month" | "day";

export type AppleCalendarMode = "stack" | "details" | "list";

export type AgendaEventType = "session" | "activity" | "form";

export interface AgendaCalendarEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  type: AgendaEventType;
  color: string;
  patientName?: string;
}

export interface MonthMatrixCell {
  dateKey: string;
  day: number;
  inCurrentMonth: boolean;
}
