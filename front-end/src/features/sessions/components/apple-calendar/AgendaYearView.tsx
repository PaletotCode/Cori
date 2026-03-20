import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { typographyContract } from "../../../../shared/ui/typography";

import { buildMonthMatrix, monthLabel, splitIntoWeeks } from "./dateUtils";
import type { AgendaCalendarEvent } from "./types";

interface AgendaYearViewProps {
  year: number;
  selectedDateKey: string;
  todayDateKey: string;
  eventsByDate: ReadonlyMap<string, AgendaCalendarEvent[]>;
  onOpenMonth: (monthDate: Date) => void;
}

function AgendaYearViewComponent({
  year,
  selectedDateKey,
  todayDateKey,
  eventsByDate,
  onOpenMonth,
}: AgendaYearViewProps) {
  const { width: viewportWidth } = useWindowDimensions();
  const monthCardWidth = viewportWidth <= 360 ? "48.2%" : "32%";
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, monthIndex) => new Date(year, monthIndex, 1)),
    [year],
  );

  return (
    <View style={styles.grid}>
      {months.map((monthDate) => {
        const monthMatrix = buildMonthMatrix(monthDate);
        const weeks = splitIntoWeeks(monthMatrix);
        const monthDateKeyPrefix = `${monthDate.getFullYear()}-${String(
          monthDate.getMonth() + 1,
        ).padStart(2, "0")}`;
        const monthHasSelection = selectedDateKey.startsWith(monthDateKeyPrefix);

        return (
          <Pressable
            accessibilityRole="button"
            key={monthDate.toISOString()}
            onPress={() => onOpenMonth(monthDate)}
            style={[styles.monthCard, { width: monthCardWidth }]}
          >
            <Text style={[styles.monthTitle, monthHasSelection ? styles.monthTitleActive : null]}>
              {monthLabel(monthDate)}
            </Text>

            <View style={styles.weeksWrap}>
              {weeks.map((week, weekIndex) => (
                <View key={`${monthDateKeyPrefix}-week-${weekIndex}`} style={styles.weekRow}>
                  {week.map((cell) => {
                    const isSelected = cell.inCurrentMonth && cell.dateKey === selectedDateKey;
                    const isToday = cell.inCurrentMonth && cell.dateKey === todayDateKey;
                    const eventsCount = eventsByDate.get(cell.dateKey)?.length ?? 0;

                    return (
                      <View key={cell.dateKey} style={styles.dayCell}>
                        <View
                          style={[
                            styles.dayPill,
                            isSelected ? styles.dayPillSelected : null,
                            isToday ? styles.dayPillToday : null,
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            ellipsizeMode="clip"
                            style={[
                              styles.dayText,
                              isToday ? styles.dayTextSelected : null,
                            ]}
                          >
                            {cell.inCurrentMonth ? cell.day : " "}
                          </Text>
                        </View>
                        {eventsCount > 0 && cell.inCurrentMonth ? (
                          <View
                            style={[
                              styles.dot,
                              isSelected ? styles.dotSelected : styles.dotDefault,
                            ]}
                          />
                        ) : (
                          <View style={styles.emptyCell} />
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export const AgendaYearView = memo(AgendaYearViewComponent);

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  monthCard: {
    gap: 4,
  },
  monthTitle: {
    color: "#101828",
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
    fontSize: 14,
    lineHeight: 18,
  },
  monthTitleActive: {
    color: "#F04438",
  },
  weeksWrap: {
    gap: 2,
  },
  weekRow: {
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    minHeight: 20,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 1,
  },
  emptyCell: {
    minHeight: 3,
  },
  dayPill: {
    minWidth: 19,
    minHeight: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 2,
  },
  dayPillSelected: {
    borderWidth: 1,
    borderColor: "#98A2B3",
  },
  dayPillToday: {
    backgroundColor: "#F04438",
  },
  dayText: {
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
    fontSize: 11,
    lineHeight: 13,
    textAlign: "center",
    includeFontPadding: false,
    color: "#101828",
  },
  dayTextSelected: {
    color: "#FFFFFF",
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 999,
  },
  dotDefault: {
    backgroundColor: "#7C97BE",
  },
  dotSelected: {
    backgroundColor: "#FFFFFF",
  },
});
