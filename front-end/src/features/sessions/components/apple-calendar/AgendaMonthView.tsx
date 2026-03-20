import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  onOpenDayView: (dateKey: string) => void;
}

const LIST_PAGE_SIZE = 10;
const EMPTY_DAY_EVENTS: AgendaCalendarEvent[] = [];

type MonthDayCellVariant = "default" | "details" | "stack";

interface MonthDayCellProps {
  cell: MonthMatrixCell;
  isSelected: boolean;
  isTodayHighlight: boolean;
  events: AgendaCalendarEvent[];
  mode: AppleCalendarMode;
  variant: MonthDayCellVariant;
  onSelectDate: (dateKey: string) => void;
}

const MonthDayCell = memo(
  function MonthDayCellComponent({
    cell,
    isSelected,
    isTodayHighlight,
    events,
    mode,
    variant,
    onSelectDate,
  }: MonthDayCellProps) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => onSelectDate(cell.dateKey)}
        style={[
          styles.dayCell,
          variant === "details" ? styles.dayCellDetails : null,
          variant === "stack" ? styles.dayCellStack : null,
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
  },
  (previous, next) =>
    previous.cell.dateKey === next.cell.dateKey &&
    previous.cell.day === next.cell.day &&
    previous.cell.inCurrentMonth === next.cell.inCurrentMonth &&
    previous.isSelected === next.isSelected &&
    previous.isTodayHighlight === next.isTodayHighlight &&
    previous.mode === next.mode &&
    previous.variant === next.variant &&
    previous.events === next.events &&
    previous.onSelectDate === next.onSelectDate,
);

const EventPreview = memo(
  function EventPreviewComponent({
    mode,
    events,
  }: {
    mode: AppleCalendarMode;
    events: AgendaCalendarEvent[];
  }) {
    if (events.length === 0) {
      return <View style={styles.eventSlotEmpty} />;
    }

    if (mode === "list") {
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
  },
  (previous, next) => previous.mode === next.mode && previous.events === next.events,
);

function AgendaMonthViewComponent({
  monthDate,
  mode,
  selectedDateKey,
  todayDateKey,
  eventsByDate,
  onSelectDate,
  onOpenDayView,
}: AgendaMonthViewProps) {
  const monthMatrix = useMemo(() => buildMonthMatrix(monthDate), [monthDate]);
  const weeks = useMemo(() => splitIntoWeeks(monthMatrix), [monthMatrix]);

  const nextMonthWeeks = useMemo(() => {
    if (mode !== "stack") {
      return [] as MonthMatrixCell[][];
    }
    return splitIntoWeeks(buildMonthMatrix(addMonths(monthDate, 1))).slice(0, 2);
  }, [mode, monthDate]);

  const selectedDateEvents = useMemo(
    () => eventsByDate.get(selectedDateKey) ?? EMPTY_DAY_EVENTS,
    [eventsByDate, selectedDateKey],
  );
  const [listPage, setListPage] = useState(1);
  const lastTapRef = useRef<{ dateKey: string; at: number } | null>(null);

  useEffect(() => {
    setListPage(1);
  }, [selectedDateKey, mode]);

  const listTotalPages = Math.max(1, Math.ceil(selectedDateEvents.length / LIST_PAGE_SIZE));
  const normalizedListPage = Math.min(listPage, listTotalPages);

  useEffect(() => {
    if (normalizedListPage !== listPage) {
      setListPage(normalizedListPage);
    }
  }, [listPage, normalizedListPage]);

  const pagedDateEvents = useMemo(() => {
    const start = (normalizedListPage - 1) * LIST_PAGE_SIZE;
    return selectedDateEvents.slice(start, start + LIST_PAGE_SIZE);
  }, [normalizedListPage, selectedDateEvents]);

  const handleDayPress = useCallback(
    (dateKey: string) => {
      const now = Date.now();
      const lastTap = lastTapRef.current;
      if (lastTap !== null && lastTap.dateKey === dateKey && now - lastTap.at <= 320) {
        onSelectDate(dateKey);
        onOpenDayView(dateKey);
        lastTapRef.current = null;
        return;
      }
      lastTapRef.current = { dateKey, at: now };
      onSelectDate(dateKey);
    },
    [onOpenDayView, onSelectDate],
  );

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
              const events = eventsByDate.get(cell.dateKey) ?? EMPTY_DAY_EVENTS;
              const variant: MonthDayCellVariant =
                mode === "details" ? "details" : mode === "stack" ? "stack" : "default";

              return (
                <MonthDayCell
                  key={cell.dateKey}
                  cell={cell}
                  isSelected={isSelected}
                  isTodayHighlight={isTodayHighlight}
                  events={events}
                  mode={mode}
                  variant={variant}
                  onSelectDate={handleDayPress}
                />
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
                const events = eventsByDate.get(cell.dateKey) ?? EMPTY_DAY_EVENTS;
                return (
                  <MonthDayCell
                    key={`next-${cell.dateKey}`}
                    cell={cell}
                    isSelected={isSelected}
                    isTodayHighlight={isTodayHighlight}
                    events={events}
                    mode={mode}
                    variant="stack"
                    onSelectDate={handleDayPress}
                  />
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
            <>
              <View style={styles.listItemsWrap}>
                {pagedDateEvents.map((event) => (
                  <View key={`list-${event.type}-${event.id}`} style={styles.listItemCard}>
                    <View style={styles.listItem}>
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
                  </View>
                ))}
              </View>

              {selectedDateEvents.length > LIST_PAGE_SIZE ? (
                <View style={styles.paginationRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setListPage((current) => Math.max(1, current - 1))}
                    style={[
                      styles.paginationButton,
                      normalizedListPage <= 1 ? styles.paginationButtonDisabled : null,
                    ]}
                    disabled={normalizedListPage <= 1}
                  >
                    <Text style={styles.paginationButtonText}>Anterior</Text>
                  </Pressable>
                  <Text style={styles.paginationLabel}>
                    Pagina {normalizedListPage} de {listTotalPages}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setListPage((current) => Math.min(listTotalPages, current + 1))
                    }
                    style={[
                      styles.paginationButton,
                      normalizedListPage >= listTotalPages ? styles.paginationButtonDisabled : null,
                    ]}
                    disabled={normalizedListPage >= listTotalPages}
                  >
                    <Text style={styles.paginationButtonText}>Proxima</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}
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
    paddingTop: 2,
    gap: 10,
  },
  listItemsWrap: {
    gap: 8,
  },
  listItemCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DFE4EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 10,
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
  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  paginationButton: {
    minHeight: 30,
    minWidth: 86,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationButtonText: {
    color: "#344054",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  paginationLabel: {
    flex: 1,
    textAlign: "center",
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
});
