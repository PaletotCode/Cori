import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { typographyContract } from "../../../../shared/ui/typography";

import { AgendaMonthView } from "./AgendaMonthView";
import { AgendaDayView } from "./AgendaDayView";
import { AgendaYearView } from "./AgendaYearView";
import { addMonths } from "./dateUtils";
import type { AgendaCalendarEvent, AppleCalendarMode, AppleCalendarScope } from "./types";

const EMPTY_DAY_EVENTS: AgendaCalendarEvent[] = [];

interface AppleAgendaCalendarProps {
  loading: boolean;
  loadingLabel?: string;
  statusLabel?: string;
  infoMessage: string | null;
  errorMessage: string | null;
  scope: AppleCalendarScope;
  mode: AppleCalendarMode;
  selectedDateKey: string;
  todayDateKey: string;
  focusedMonth: Date;
  eventsByDate: ReadonlyMap<string, AgendaCalendarEvent[]>;
  onScopeChange: (scope: AppleCalendarScope) => void;
  onSelectDate: (dateKey: string) => void;
  onOpenDayView: (dateKey: string) => void;
  onExitDayView: () => void;
  onRescheduleSession: (
    sessionId: string,
    nextStartAtIso: string,
    nextEndAtIso: string,
  ) => Promise<boolean>;
  onFocusedMonthChange: (monthDate: Date) => void;
}

export function AppleAgendaCalendar({
  loading,
  loadingLabel = "Carregando agenda...",
  statusLabel,
  infoMessage,
  errorMessage,
  scope,
  mode,
  selectedDateKey,
  todayDateKey,
  focusedMonth,
  eventsByDate,
  onScopeChange,
  onSelectDate,
  onOpenDayView,
  onExitDayView,
  onRescheduleSession,
  onFocusedMonthChange,
}: AppleAgendaCalendarProps) {
  const transition = useRef(new Animated.Value(1)).current;
  const selectedDayEvents = useMemo(
    () => eventsByDate.get(selectedDateKey) ?? EMPTY_DAY_EVENTS,
    [eventsByDate, selectedDateKey],
  );

  useEffect(() => {
    transition.setValue(0);
    const animation = Animated.timing(transition, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [focusedMonth, mode, scope, transition]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (scope !== "month") {
            return false;
          }
          return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 12;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (scope !== "month") {
            return;
          }
          if (gestureState.dx <= -58) {
            onFocusedMonthChange(addMonths(focusedMonth, 1));
            return;
          }
          if (gestureState.dx >= 58) {
            onFocusedMonthChange(addMonths(focusedMonth, -1));
          }
        },
      }),
    [focusedMonth, onFocusedMonthChange, scope],
  );

  return (
    <View style={styles.container}>
      {statusLabel ? <Text style={styles.statusText}>{statusLabel}</Text> : null}
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}

      <Animated.View
        style={[
          styles.contentFrame,
          {
            opacity: transition,
            transform: [
              {
                translateY: transition.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {scope === "day" ? (
          <View style={styles.dayScopeWrap}>
            <AgendaDayView
              selectedDateKey={selectedDateKey}
              todayDateKey={todayDateKey}
              events={selectedDayEvents}
              onSelectDate={onSelectDate}
              onBackToPreviousScope={onExitDayView}
              onRescheduleSession={onRescheduleSession}
            />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {scope === "year" ? (
              <AgendaYearView
                year={focusedMonth.getFullYear()}
                selectedDateKey={selectedDateKey}
                todayDateKey={todayDateKey}
                eventsByDate={eventsByDate}
                onOpenMonth={(monthDate) => {
                  onFocusedMonthChange(monthDate);
                  onScopeChange("month");
                }}
              />
            ) : null}

            {scope === "month" ? (
              <AgendaMonthView
                monthDate={focusedMonth}
                mode={mode}
                selectedDateKey={selectedDateKey}
                todayDateKey={todayDateKey}
                eventsByDate={eventsByDate}
                onSelectDate={onSelectDate}
                onOpenDayView={onOpenDayView}
              />
            ) : null}
          </ScrollView>
        )}
        {loading ? (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <View style={styles.loadingBadge}>
              <ActivityIndicator size="small" color="#344054" />
              <Text style={styles.loadingLabel}>{loadingLabel}</Text>
            </View>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 8,
  },
  statusText: {
    color: "#334155",
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  contentFrame: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 8,
  },
  loadingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "rgba(255, 255, 255, 0.93)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  loadingLabel: {
    color: "#475467",
    fontSize: 12,
    lineHeight: 15,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  scrollContent: {
    paddingBottom: 150,
    gap: 10,
  },
  dayScopeWrap: {
    flex: 1,
  },
  errorText: {
    color: "#B42318",
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  infoText: {
    color: "#027A48",
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
});
