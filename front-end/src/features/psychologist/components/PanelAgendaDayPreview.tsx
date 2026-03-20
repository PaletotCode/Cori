import { memo, useMemo, type Dispatch, type SetStateAction } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { typographyContract } from "../../../shared/ui/typography";
import type { SessionAgendaItem } from "../../sessions/api/types";
import { WEEKDAY_LABELS_PT, fromDateKey, toDateKeyFromDate, toDateKeyFromIso } from "../../sessions/components/apple-calendar/dateUtils";

const PREVIEW_HOUR_HEIGHT = 44;
const PREVIEW_DAY_MINUTES = 24 * 60;
const PREVIEW_LEFT_GUTTER = 48;
const PREVIEW_HOURS = Array.from({ length: 24 }, (_, index) => index);

interface PanelAgendaDayPreviewProps {
  selectedDateKey: string;
  todayDateKey: string;
  weekSessions: SessionAgendaItem[];
  onSelectDate: Dispatch<SetStateAction<string>>;
  onPressSession: (session: SessionAgendaItem) => void;
}

function toMinutesFromIso(isoDateTime: string): number {
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }
  return parsed.getHours() * 60 + parsed.getMinutes();
}

function toClockLabel(minutes: number): string {
  const normalized = Math.max(0, Math.min(PREVIEW_DAY_MINUTES - 1, minutes));
  const hour = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minute = String(normalized % 60).padStart(2, "0");
  return `${hour}:${minute}`;
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

function getSessionLayout(session: SessionAgendaItem, pixelsPerMinute: number): {
  startMinutes: number;
  durationMinutes: number;
  eventHeight: number;
} {
  const startMinutes = toMinutesFromIso(session.scheduledStartAt);
  const endMinutes = toMinutesFromIso(session.scheduledEndAt);
  const durationMinutes = Math.max(30, endMinutes - startMinutes);
  const eventHeight = Math.max(34, durationMinutes * pixelsPerMinute);
  return {
    startMinutes,
    durationMinutes,
    eventHeight,
  };
}

export const PanelAgendaDayPreview = memo(function PanelAgendaDayPreview({
  selectedDateKey,
  todayDateKey,
  weekSessions,
  onSelectDate,
  onPressSession,
}: PanelAgendaDayPreviewProps) {
  const pixelsPerMinute = PREVIEW_HOUR_HEIGHT / 60;

  const selectedDate = useMemo(() => fromDateKey(selectedDateKey), [selectedDateKey]);

  const weekDates = useMemo(() => {
    const weekStart = new Date(selectedDate);
    weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      return date;
    });
  }, [selectedDate]);

  const daySessions = useMemo(
    () =>
      weekSessions
        .filter((session) => toDateKeyFromIso(session.scheduledStartAt) === selectedDateKey)
        .sort((left, right) => left.scheduledStartAt.localeCompare(right.scheduledStartAt)),
    [selectedDateKey, weekSessions],
  );

  const nowMinutes = useMemo(() => {
    if (selectedDateKey !== todayDateKey) {
      return null;
    }
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, [selectedDateKey, todayDateKey]);

  return (
    <View style={styles.previewWrap}>
      <View style={styles.weekStrip}>
        {weekDates.map((date, index) => {
          const dateKey = toDateKeyFromDate(date);
          const isSelected = dateKey === selectedDateKey;
          const isToday = dateKey === todayDateKey;
          return (
            <Pressable
              key={dateKey}
              accessibilityRole="button"
              onPress={() => onSelectDate(dateKey)}
              style={styles.weekDayCell}
            >
              <Text style={[styles.weekdayLabel, isSelected ? styles.weekdayLabelSelected : null]}>
                {WEEKDAY_LABELS_PT[index]}
              </Text>
              <View
                style={[
                  styles.weekdayDatePill,
                  isSelected ? styles.weekdayDatePillSelected : null,
                ]}
              >
                <Text
                  style={[
                    styles.weekdayDateText,
                    isSelected ? styles.weekdayDateTextSelected : null,
                    !isSelected && isToday ? styles.weekdayDateTextToday : null,
                  ]}
                >
                  {date.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.timelineViewport}>
        <ScrollView
          bounces
          alwaysBounceVertical
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.timelineScrollContent}
        >
          <View
            style={[
              styles.timelineLayer,
              { height: PREVIEW_DAY_MINUTES * pixelsPerMinute },
            ]}
          >
            {PREVIEW_HOURS.map((hour) => (
              <View key={`hour-${hour}`} style={[styles.hourRow, { top: hour * PREVIEW_HOUR_HEIGHT }]}>
                <Text style={styles.hourLabel}>{String(hour).padStart(2, "0")}:00</Text>
                <View style={styles.hourDivider} />
              </View>
            ))}

            {nowMinutes !== null ? (
              <View style={[styles.nowLineRow, { top: nowMinutes * pixelsPerMinute }]}>
                <View style={styles.nowPill}>
                  <Text style={styles.nowPillText}>{toClockLabel(nowMinutes)}</Text>
                </View>
                <View style={styles.nowLine} />
              </View>
            ) : null}

            <View style={styles.eventsOverlay}>
              {daySessions.map((session) => {
                const layout = getSessionLayout(session, pixelsPerMinute);
                const color = sessionColor(session.status);
                return (
                  <Pressable
                    key={session.id}
                    accessibilityRole="button"
                    onPress={() => onPressSession(session)}
                    style={[
                      styles.eventCard,
                      {
                        top: layout.startMinutes * pixelsPerMinute,
                        minHeight: layout.eventHeight,
                        borderLeftColor: color,
                      },
                    ]}
                  >
                    <View style={styles.eventPressable}>
                      <Text numberOfLines={1} style={styles.eventTitle}>
                        {session.patientName}
                      </Text>
                      <Text numberOfLines={1} style={styles.eventMetaText}>
                        {`${toClockLabel(layout.startMinutes)} - ${toClockLabel(
                          layout.startMinutes + layout.durationMinutes,
                        )}`}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  previewWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DFE4EC",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  weekStrip: {
    borderBottomWidth: 1,
    borderColor: "#E5E7EB",
    minHeight: 62,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weekDayCell: {
    width: "13.6%",
    alignItems: "center",
    gap: 4,
  },
  weekdayLabel: {
    color: "#6B7280",
    fontSize: 10.5,
    lineHeight: 13,
    textTransform: "uppercase",
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  weekdayLabelSelected: {
    color: "#111827",
  },
  weekdayDatePill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  weekdayDatePillSelected: {
    backgroundColor: "#FF3B40",
  },
  weekdayDateText: {
    color: "#111827",
    fontSize: 13.5,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  weekdayDateTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  weekdayDateTextToday: {
    color: "#FF3B40",
  },
  timelineViewport: {
    height: 260,
  },
  timelineScrollContent: {
    paddingBottom: 72,
  },
  timelineLayer: {
    position: "relative",
  },
  hourRow: {
    position: "absolute",
    left: 0,
    right: 0,
    minHeight: PREVIEW_HOUR_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  hourLabel: {
    width: PREVIEW_LEFT_GUTTER,
    textAlign: "right",
    paddingRight: 8,
    color: "#9CA3AF",
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  hourDivider: {
    flex: 1,
    marginTop: 7,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  nowLineRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  nowPill: {
    marginLeft: 4,
    minWidth: 52,
    paddingHorizontal: 8,
    minHeight: 22,
    borderRadius: 999,
    backgroundColor: "#FF3B40",
    alignItems: "center",
    justifyContent: "center",
  },
  nowPillText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    lineHeight: 13,
    fontFamily: typographyContract.fontFamily,
    fontWeight: "700",
  },
  nowLine: {
    flex: 1,
    borderTopWidth: 1.5,
    borderTopColor: "#FF3B40",
    marginLeft: 6,
  },
  eventsOverlay: {
    ...StyleSheet.absoluteFillObject,
    left: PREVIEW_LEFT_GUTTER + 8,
    right: 6,
  },
  eventCard: {
    position: "absolute",
    left: 0,
    right: 0,
    borderRadius: 8,
    borderLeftWidth: 4,
    backgroundColor: "#DCEEFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 9,
    elevation: 2,
  },
  eventPressable: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 2,
  },
  eventTitle: {
    color: "#0B4A89",
    fontSize: 13.5,
    lineHeight: 17,
    fontFamily: typographyContract.fontFamily,
    fontWeight: "700",
  },
  eventMetaText: {
    color: "#1668C3",
    fontSize: 11.5,
    lineHeight: 14,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
});
