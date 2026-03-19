import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { typographyContract } from "../../../../shared/ui/typography";

import {
  WEEKDAY_LABELS_PT,
  combineDateAndTime,
  fromDateKey,
  toDateKeyFromDate,
} from "./dateUtils";
import type { AgendaCalendarEvent } from "./types";

interface AgendaDayViewProps {
  selectedDateKey: string;
  todayDateKey: string;
  events: AgendaCalendarEvent[];
  onSelectDate: (dateKey: string) => void;
  onBackToPreviousScope: () => void;
  onRescheduleSession: (
    sessionId: string,
    nextStartAtIso: string,
    nextEndAtIso: string,
  ) => Promise<boolean>;
}

interface ActiveDragState {
  event: AgendaCalendarEvent;
  startMinutes: number;
  durationMinutes: number;
  eventHeight: number;
  isSaving: boolean;
}

const HOUR_HEIGHT = 62;
const DAY_MINUTES = 24 * 60;
const SNAP_MINUTES = 5;
const MIN_EVENT_MINUTES = 30;
const DRAG_ARM_DELAY_MS = 220;
const TIMELINE_LEFT_GUTTER = 56;
const HOURS = Array.from({ length: 24 }, (_, index) => index);

function toMinutesFromIso(isoDateTime: string): number {
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }
  return parsed.getHours() * 60 + parsed.getMinutes();
}

function toClockLabel(minutes: number): string {
  const normalized = Math.max(0, Math.min(DAY_MINUTES - 1, minutes));
  const hour = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minute = String(normalized % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function clampStartMinutes(startMinutes: number, durationMinutes: number): number {
  const maxStart = Math.max(0, DAY_MINUTES - durationMinutes);
  return Math.max(0, Math.min(maxStart, startMinutes));
}

function toIsoFromDayMinutes(selectedDateKey: string, minutes: number): string | null {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return combineDateAndTime(selectedDateKey, `${hour}:${minute}`);
}

function getEventLayout(event: AgendaCalendarEvent, pixelsPerMinute: number): {
  startMinutes: number;
  durationMinutes: number;
  eventHeight: number;
} {
  const startMinutes = toMinutesFromIso(event.startsAt);
  const endMinutes = toMinutesFromIso(event.endsAt);
  const durationMinutes = Math.max(MIN_EVENT_MINUTES, endMinutes - startMinutes);
  const eventHeight = Math.max(34, durationMinutes * pixelsPerMinute);

  return {
    startMinutes,
    durationMinutes,
    eventHeight,
  };
}

export const AgendaDayView = memo(function AgendaDayView({
  selectedDateKey,
  todayDateKey,
  events,
  onSelectDate,
  onBackToPreviousScope,
  onRescheduleSession,
}: AgendaDayViewProps) {
  const pixelsPerMinute = HOUR_HEIGHT / 60;
  const dragMotion = useRef(new Animated.Value(0)).current;
  const activeDragRef = useRef<ActiveDragState | null>(null);
  const dragArmLockedRef = useRef(false);
  const timelineScrollRef = useRef<ScrollView | null>(null);
  const timelineOffsetRef = useRef(0);

  const [activeDrag, setActiveDrag] = useState<ActiveDragState | null>(null);
  const [dragPreviewMinutes, setDragPreviewMinutes] = useState<number | null>(null);
  const [dragArmed, setDragArmed] = useState(false);

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

  const dayEvents = useMemo(
    () => [...events].sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
    [events],
  );

  const nowMinutes = useMemo(() => {
    if (selectedDateKey !== todayDateKey) {
      return null;
    }
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, [selectedDateKey, todayDateKey]);

  const endDrag = useCallback(() => {
    activeDragRef.current = null;
    setActiveDrag(null);
    setDragPreviewMinutes(null);
    dragMotion.setValue(0);
    dragArmLockedRef.current = false;
    setDragArmed(false);
  }, [dragMotion]);

  const lockDragArm = useCallback(() => {
    if (activeDragRef.current !== null || dragArmLockedRef.current) {
      return;
    }
    // 🚀 PERFORMANCE: interrompe inercia de scroll antes do long press para impedir que o fundo "ande" durante drag.
    timelineScrollRef.current?.scrollTo({ y: timelineOffsetRef.current, animated: false });
    dragArmLockedRef.current = true;
    setDragArmed(true);
  }, []);

  const releaseDragArmIfIdle = useCallback(() => {
    if (activeDragRef.current !== null || !dragArmLockedRef.current) {
      return;
    }
    dragArmLockedRef.current = false;
    setDragArmed(false);
  }, []);

  useEffect(() => {
    // 🚀 PERFORMANCE: garante cleanup consistente do estado de drag ao trocar o dia selecionado.
    endDrag();
  }, [endDrag, selectedDateKey]);

  const beginDrag = useCallback(
    (event: AgendaCalendarEvent) => {
      if (event.type !== "session") {
        return;
      }
      if (activeDragRef.current !== null) {
        return;
      }

      const layout = getEventLayout(event, pixelsPerMinute);
      const nextState: ActiveDragState = {
        event,
        startMinutes: layout.startMinutes,
        durationMinutes: layout.durationMinutes,
        eventHeight: layout.eventHeight,
        isSaving: false,
      };

      activeDragRef.current = nextState;
      setActiveDrag(nextState);
      setDragPreviewMinutes(layout.startMinutes);
      dragMotion.setValue(0);
      dragArmLockedRef.current = false;
      setDragArmed(false);
    },
    [dragMotion, pixelsPerMinute],
  );

  const finalizeDrag = useCallback(
    async (gestureDy: number) => {
      const currentDrag = activeDragRef.current;
      if (currentDrag === null) {
        endDrag();
        return;
      }

      const dragMinutes = gestureDy / pixelsPerMinute;
      const snappedMinutes = Math.round(dragMinutes / SNAP_MINUTES) * SNAP_MINUTES;
      const nextStartMinutes = clampStartMinutes(
        currentDrag.startMinutes + snappedMinutes,
        currentDrag.durationMinutes,
      );
      const nextEndMinutes = nextStartMinutes + currentDrag.durationMinutes;

      if (nextStartMinutes === currentDrag.startMinutes) {
        endDrag();
        return;
      }

      const nextStartIso = toIsoFromDayMinutes(selectedDateKey, nextStartMinutes);
      const nextEndIso = toIsoFromDayMinutes(selectedDateKey, nextEndMinutes);
      if (nextStartIso === null || nextEndIso === null) {
        endDrag();
        return;
      }

      const savingState: ActiveDragState = {
        ...currentDrag,
        isSaving: true,
      };
      activeDragRef.current = savingState;
      setActiveDrag(savingState);

      await onRescheduleSession(currentDrag.event.id, nextStartIso, nextEndIso);
      endDrag();
    },
    [endDrag, onRescheduleSession, pixelsPerMinute, selectedDateKey],
  );

  const updateDragPreviewFromDy = useCallback(
    (dragDy: number) => {
      const currentDrag = activeDragRef.current;
      if (currentDrag === null || currentDrag.isSaving) {
        return;
      }

      const dragMinutes = dragDy / pixelsPerMinute;
      const snappedMinutes = Math.round(dragMinutes / SNAP_MINUTES) * SNAP_MINUTES;
      const previewStartMinutes = clampStartMinutes(
        currentDrag.startMinutes + snappedMinutes,
        currentDrag.durationMinutes,
      );
      setDragPreviewMinutes(previewStartMinutes);
      dragMotion.setValue((previewStartMinutes - currentDrag.startMinutes) * pixelsPerMinute);
    },
    [dragMotion, pixelsPerMinute],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => activeDragRef.current !== null,
        onStartShouldSetPanResponder: () => activeDragRef.current !== null,
        onMoveShouldSetPanResponderCapture: () => activeDragRef.current !== null,
        onMoveShouldSetPanResponder: () => activeDragRef.current !== null,
        onPanResponderMove: (_, gestureState) => {
          updateDragPreviewFromDy(gestureState.dy);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (activeDragRef.current === null) {
            endDrag();
            return;
          }
          void finalizeDrag(gestureState.dy);
        },
        onPanResponderTerminate: () => {
          endDrag();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [endDrag, finalizeDrag, updateDragPreviewFromDy],
  );

  const timelineScrollEnabled = activeDrag === null && !dragArmed;

  return (
    <View style={styles.dayContainer}>
      <View style={styles.dayHeaderRow}>
        <Pressable
          accessibilityRole="button"
          onPress={onBackToPreviousScope}
          style={styles.monthBackButton}
        >
          <Ionicons name="arrow-back" size={15} color="#334155" />
          <Text style={styles.monthBackLabel}>Voltar para agenda</Text>
        </Pressable>
      </View>

      <View style={styles.weekStrip}>
        {weekDates.map((date, index) => {
          const dateKey = toDateKeyFromDate(date);
          const isSelected = dateKey === selectedDateKey;
          const isToday = dateKey === todayDateKey;
          return (
            <Pressable
              accessibilityRole="button"
              disabled={activeDrag !== null || dragArmed}
              key={dateKey}
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

      <ScrollView
        ref={timelineScrollRef}
        bounces={timelineScrollEnabled}
        alwaysBounceVertical={timelineScrollEnabled}
        onScroll={(event) => {
          timelineOffsetRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        scrollEnabled={timelineScrollEnabled}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.timelineScrollContent}
      >
        <View
          style={[styles.timelineLayer, { height: DAY_MINUTES * pixelsPerMinute }]}
          // 🚀 PERFORMANCE: responder fica na camada estável da timeline para não perder gesto durante long press.
          {...panResponder.panHandlers}
        >
          {HOURS.map((hour) => (
            <View key={`hour-${hour}`} style={[styles.hourRow, { top: hour * HOUR_HEIGHT }]}> 
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

          {dragPreviewMinutes !== null ? (
            <View style={[styles.dragPreviewRow, { top: dragPreviewMinutes * pixelsPerMinute }]}>
              <Text style={styles.dragPreviewLabel}>{toClockLabel(dragPreviewMinutes)}</Text>
              <View style={styles.dragPreviewLine} />
            </View>
          ) : null}

          <View style={styles.eventsOverlay}>
            {dayEvents.map((event) => {
              const layout = getEventLayout(event, pixelsPerMinute);
              const isActive = activeDrag?.event.id === event.id;
              const isSessionEvent = event.type === "session";

              return (
                <View key={`${event.type}-${event.id}`}>
                  {isActive ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.eventCardGhost,
                        {
                          top: layout.startMinutes * pixelsPerMinute,
                          minHeight: layout.eventHeight,
                          borderLeftColor: event.color,
                        },
                      ]}
                    >
                      <View style={styles.eventPressable}>
                        <Text numberOfLines={1} style={styles.eventTitleGhost}>
                          {event.title}
                        </Text>
                        <View style={styles.eventMetaRow}>
                          <Ionicons name="time-outline" size={13} color="#6AA8E3" />
                          <Text numberOfLines={1} style={styles.eventMetaTextGhost}>
                            {`${toClockLabel(layout.startMinutes)} - ${toClockLabel(
                              layout.startMinutes + layout.durationMinutes,
                            )}`}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : null}

                  {isActive ? (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.eventCard,
                        styles.eventCardDragging,
                        {
                          top: layout.startMinutes * pixelsPerMinute,
                          minHeight: layout.eventHeight,
                          borderLeftColor: event.color,
                          transform: [{ translateY: dragMotion }],
                          opacity: activeDrag?.isSaving ? 0.72 : 1,
                        },
                      ]}
                    >
                      <View style={styles.eventPressable}>
                        <Text numberOfLines={1} style={[styles.eventTitle, styles.eventTitleDragging]}>
                          {event.title}
                        </Text>
                        <View style={styles.eventMetaRow}>
                          <Ionicons name="time-outline" size={13} color="#DCEEFF" />
                          <Text numberOfLines={1} style={[styles.eventMetaText, styles.eventMetaTextDragging]}>
                            {dragPreviewMinutes !== null
                              ? `${toClockLabel(dragPreviewMinutes)} - ${toClockLabel(
                                  dragPreviewMinutes + layout.durationMinutes,
                                )}`
                              : `${toClockLabel(layout.startMinutes)} - ${toClockLabel(
                                  layout.startMinutes + layout.durationMinutes,
                                )}`}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.dragHandleTop} />
                      <View style={styles.dragHandleBottom} />
                    </Animated.View>
                  ) : (
                    <Pressable
                      delayLongPress={isSessionEvent ? DRAG_ARM_DELAY_MS : 0}
                      disabled={!isSessionEvent}
                      onPressIn={isSessionEvent ? lockDragArm : undefined}
                      onLongPress={isSessionEvent ? () => beginDrag(event) : undefined}
                      onPressOut={isSessionEvent ? releaseDragArmIfIdle : undefined}
                      style={[
                        styles.eventCard,
                        {
                          top: layout.startMinutes * pixelsPerMinute,
                          minHeight: layout.eventHeight,
                          borderLeftColor: event.color,
                        },
                      ]}
                    >
                      <View style={styles.eventPressable}>
                        <Text numberOfLines={1} style={styles.eventTitle}>
                          {event.title}
                        </Text>
                        <View style={styles.eventMetaRow}>
                          <Ionicons name="time-outline" size={13} color="#1D4ED8" />
                          <Text numberOfLines={1} style={styles.eventMetaText}>
                            {`${toClockLabel(layout.startMinutes)} - ${toClockLabel(
                              layout.startMinutes + layout.durationMinutes,
                            )}`}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  dayContainer: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DFE4EC",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  dayHeaderRow: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
  },
  monthBackButton: {
    alignSelf: "flex-start",
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  monthBackLabel: {
    color: "#334155",
    fontSize: 11.5,
    lineHeight: 15,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  weekStrip: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#E5E7EB",
    minHeight: 74,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weekDayCell: {
    width: "13.6%",
    alignItems: "center",
    gap: 5,
  },
  weekdayLabel: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 14,
    textTransform: "uppercase",
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  weekdayLabelSelected: {
    color: "#111827",
  },
  weekdayDatePill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  weekdayDatePillSelected: {
    backgroundColor: "#FF3B40",
  },
  weekdayDateText: {
    color: "#111827",
    fontSize: 15,
    lineHeight: 18,
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
  timelineScrollContent: {
    paddingBottom: 96,
  },
  timelineLayer: {
    position: "relative",
  },
  hourRow: {
    position: "absolute",
    left: 0,
    right: 0,
    minHeight: HOUR_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  hourLabel: {
    width: TIMELINE_LEFT_GUTTER,
    textAlign: "right",
    paddingRight: 8,
    color: "#9CA3AF",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  hourDivider: {
    flex: 1,
    marginTop: 9,
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
    marginLeft: 6,
    minWidth: 60,
    paddingHorizontal: 9,
    minHeight: 26,
    borderRadius: 999,
    backgroundColor: "#FF3B40",
    alignItems: "center",
    justifyContent: "center",
  },
  nowPillText: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 14,
    fontFamily: typographyContract.fontFamily,
    fontWeight: "700",
  },
  nowLine: {
    flex: 1,
    borderTopWidth: 2,
    borderTopColor: "#FF3B40",
    marginLeft: 8,
  },
  dragPreviewRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  dragPreviewLabel: {
    width: TIMELINE_LEFT_GUTTER,
    textAlign: "right",
    paddingRight: 8,
    color: "#6B7280",
    fontSize: 13,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  dragPreviewLine: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: "#93C5FD",
  },
  eventsOverlay: {
    ...StyleSheet.absoluteFillObject,
    left: TIMELINE_LEFT_GUTTER + 10,
    right: 8,
  },
  eventCard: {
    position: "absolute",
    left: 0,
    right: 0,
    borderRadius: 8,
    borderLeftWidth: 4,
    backgroundColor: "#DCEEFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 7 },
    shadowRadius: 12,
    elevation: 4,
  },
  eventCardGhost: {
    position: "absolute",
    left: 0,
    right: 0,
    borderRadius: 8,
    borderLeftWidth: 4,
    backgroundColor: "#DCEEFF",
    opacity: 0.45,
  },
  eventCardDragging: {
    backgroundColor: "#1E88E5",
    zIndex: 12,
    shadowOpacity: 0.24,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 16,
    elevation: 10,
  },
  eventPressable: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 2,
  },
  eventTitle: {
    color: "#0B4A89",
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typographyContract.fontFamily,
    fontWeight: "700",
  },
  eventTitleGhost: {
    color: "#387DBA",
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  eventTitleDragging: {
    color: "#FFFFFF",
  },
  eventMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  eventMetaText: {
    color: "#1668C3",
    fontSize: 13,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  eventMetaTextGhost: {
    color: "#6AA8E3",
    fontSize: 13,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  eventMetaTextDragging: {
    color: "#DCEEFF",
  },
  dragHandleTop: {
    position: "absolute",
    top: -6,
    right: 14,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#1E88E5",
  },
  dragHandleBottom: {
    position: "absolute",
    bottom: -6,
    left: 14,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#1E88E5",
  },
});
