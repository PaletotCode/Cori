import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { typographyContract } from "../../../../shared/ui/typography";

import {
  WEEKDAY_LABELS_PT,
  addMonths,
  buildMonthMatrix,
  monthLabel,
  splitIntoWeeks,
  toTimeLabel,
} from "./dateUtils";
import type { AgendaCalendarEvent, AppleCalendarMode, MonthMatrixCell } from "./types";

interface AgendaMonthViewProps {
  monthDate: Date;
  mode: AppleCalendarMode;
  selectedDateKey: string;
  todayDateKey: string;
  eventsByDate: ReadonlyMap<string, AgendaCalendarEvent[]>;
  onSelectDate: (dateKey: string) => void;
}

function AgendaMonthViewComponent({
  monthDate,
  mode,
  selectedDateKey,
  todayDateKey,
  eventsByDate,
  onSelectDate,
}: AgendaMonthViewProps) {
  const monthMatrix = useMemo(() => buildMonthMatrix(monthDate), [monthDate]);
  const weeks = useMemo(() => splitIntoWeeks(monthMatrix), [monthMatrix]);

  const nextMonthWeeks = useMemo(() => {
    if (mode !== "stack") {
      return [] as MonthMatrixCell[][];
    }
    return splitIntoWeeks(buildMonthMatrix(addMonths(monthDate, 1))).slice(0, 2);
  }, [mode, monthDate]);

  const selectedDateEvents = eventsByDate.get(selectedDateKey) ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS_PT.map((label, index) => (
          <Text key={`${label}-${index}`} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.monthGrid}>
        {weeks.map((week, weekIndex) => (
          <View key={`week-${weekIndex}`} style={styles.weekRow}>
            {week.map((cell) => {
              const isSelected = cell.dateKey === selectedDateKey;
              const isToday = cell.dateKey === todayDateKey;
              const isTodayHighlight = cell.inCurrentMonth && isToday;
              const events = eventsByDate.get(cell.dateKey) ?? [];

              return (
                <Pressable
                  accessibilityRole="button"
                  key={cell.dateKey}
                  onPress={() => onSelectDate(cell.dateKey)}
                  style={[
                    styles.dayCell,
                    mode === "details" ? styles.dayCellDetails : null,
                    mode === "stack" ? styles.dayCellStack : null,
                  ]}
                >
                  <View
                    style={[
                      styles.dayBadge,
                      isSelected && !isTodayHighlight ? styles.dayBadgeSelected : null,
                      isTodayHighlight ? styles.dayBadgeToday : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayLabel,
                        !cell.inCurrentMonth ? styles.dayLabelOutside : null,
                        isTodayHighlight ? styles.dayLabelSelected : null,
                      ]}
                    >
                      {cell.day}
                    </Text>
                  </View>

                  <EventPreview mode={mode} events={events} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {mode === "stack" ? (
        <View style={styles.stackContinuation}>
          <Text style={styles.stackContinuationTitle}>{monthLabel(addMonths(monthDate, 1))}</Text>
          {nextMonthWeeks.map((week, weekIndex) => (
            <View key={`next-week-${weekIndex}`} style={styles.weekRow}>
              {week.map((cell) => {
                const isSelected = cell.dateKey === selectedDateKey;
                const isToday = cell.dateKey === todayDateKey;
                const isTodayHighlight = cell.inCurrentMonth && isToday;
                const events = eventsByDate.get(cell.dateKey) ?? [];
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={`next-${cell.dateKey}`}
                    onPress={() => onSelectDate(cell.dateKey)}
                    style={[styles.dayCell, styles.dayCellStack]}
                  >
                    <View
                      style={[
                        styles.dayBadge,
                        isSelected && !isTodayHighlight ? styles.dayBadgeSelected : null,
                        isTodayHighlight ? styles.dayBadgeToday : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayLabel,
                          !cell.inCurrentMonth ? styles.dayLabelOutside : null,
                          isTodayHighlight ? styles.dayLabelSelected : null,
                        ]}
                      >
                        {cell.day}
                      </Text>
                    </View>
                    <EventPreview mode={mode} events={events} />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}

      {mode === "list" ? (
        <View style={styles.listSection}>
          {selectedDateEvents.length === 0 ? (
            <Text style={styles.emptyListText}>Nenhum compromisso para este dia.</Text>
          ) : (
            selectedDateEvents.map((event) => (
              <View key={`list-${event.id}`} style={styles.listItem}>
                <View style={[styles.listStripe, { backgroundColor: event.color }]} />
                <View style={styles.listContent}>
                  <Text numberOfLines={1} style={styles.listTitle}>
                    {event.title}
                  </Text>
                  <Text style={styles.listMeta}>
                    {toTimeLabel(event.startsAt)} - {toTimeLabel(event.endsAt)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function EventPreview({ mode, events }: { mode: AppleCalendarMode; events: AgendaCalendarEvent[] }) {
  if (events.length === 0) {
    return <View style={styles.eventSlotEmpty} />;
  }

  if (mode === "compact" || mode === "list") {
    return (
      <View style={styles.dotRow}>
        {events.slice(0, 3).map((event) => (
          <View key={`dot-${event.id}`} style={[styles.dot, { backgroundColor: event.color }]} />
        ))}
        {events.length > 3 ? <Text style={styles.moreLabel}>+</Text> : null}
      </View>
    );
  }

  if (mode === "stack") {
    return (
      <View style={styles.stackBarWrap}>
        {events.slice(0, 2).map((event) => (
          <View key={`stack-${event.id}`} style={[styles.stackBar, { backgroundColor: event.color }]} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.detailsEventWrap}>
      {events.slice(0, 2).map((event) => (
        <View key={`detail-${event.id}`} style={[styles.detailsPill, { backgroundColor: `${event.color}30` }]}>
          <Text numberOfLines={1} style={[styles.detailsPillText, { color: event.color }]}>
            {event.title}
          </Text>
        </View>
      ))}
      {events.length > 2 ? <Text style={styles.moreLabel}>+{events.length - 2}</Text> : null}
    </View>
  );
}

export const AgendaMonthView = memo(AgendaMonthViewComponent);

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  weekdayRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#D9DDE5",
    paddingBottom: 6,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  monthGrid: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DFE4EC",
    backgroundColor: "#FFFFFF",
  },
  weekRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EBF2",
  },
  dayCell: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 5,
    gap: 2,
    alignItems: "center",
  },
  dayCellDetails: {
    minHeight: 84,
  },
  dayCellStack: {
    minHeight: 68,
    gap: 4,
  },
  dayBadge: {
    minWidth: 28,
    minHeight: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBadgeSelected: {
    borderWidth: 1,
    borderColor: "#98A2B3",
  },
  dayBadgeToday: {
    backgroundColor: "#F04438",
  },
  dayLabel: {
    color: "#101828",
    fontSize: 17,
    lineHeight: 20,
    textAlign: "center",
    includeFontPadding: false,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  dayLabelSelected: {
    color: "#FFFFFF",
  },
  dayLabelOutside: {
    color: "#98A2B3",
  },
  eventSlotEmpty: {
    minHeight: 8,
  },
  dotRow: {
    minHeight: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  moreLabel: {
    color: "#98A2B3",
    fontSize: 10,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  detailsEventWrap: {
    width: "100%",
    gap: 3,
  },
  detailsPill: {
    borderRadius: 8,
    minHeight: 16,
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  detailsPillText: {
    fontSize: 10,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  stackBarWrap: {
    width: "90%",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  stackBar: {
    width: "70%",
    height: 8,
    borderRadius: 4,
  },
  stackContinuation: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DFE4EC",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  stackContinuationTitle: {
    textAlign: "center",
    color: "#344054",
    fontSize: 18,
    lineHeight: 22,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EBF2",
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  listSection: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DFE4EC",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 10,
  },
  emptyListText: {
    color: "#667085",
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  listStripe: {
    width: 4,
    borderRadius: 3,
  },
  listContent: {
    flex: 1,
    gap: 1,
  },
  listTitle: {
    color: "#344054",
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  listMeta: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
});
