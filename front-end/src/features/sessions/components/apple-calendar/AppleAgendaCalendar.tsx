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
import { AgendaYearView } from "./AgendaYearView";
import { addMonths } from "./dateUtils";
import type { AgendaCalendarEvent, AppleCalendarMode, AppleCalendarScope } from "./types";

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
  onFocusedMonthChange,
}: AppleAgendaCalendarProps) {
  const transition = useRef(new Animated.Value(1)).current;

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
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#344054" />
            <Text style={styles.loadingLabel}>{loadingLabel}</Text>
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
            ) : (
              <AgendaMonthView
                monthDate={focusedMonth}
                mode={mode}
                selectedDateKey={selectedDateKey}
                todayDateKey={todayDateKey}
                eventsByDate={eventsByDate}
                onSelectDate={onSelectDate}
              />
            )}
          </ScrollView>
        )}
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
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingLabel: {
    color: "#475467",
    fontSize: 15,
    lineHeight: 19,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  scrollContent: {
    paddingBottom: 150,
    gap: 10,
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
