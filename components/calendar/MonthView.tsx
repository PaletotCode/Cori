import {
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    isToday,
    startOfMonth,
    startOfWeek,
} from 'date-fns';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AgendaEvento } from '../../types/api';

interface Props {
    date: Date;
    events: AgendaEvento[];
    allMonthEvents: Map<string, AgendaEvento[]>; // key: 'YYYY-MM-DD'
    onDayPress: (day: Date) => void;
}

const DOT_COLORS: Record<string, string> = {
    sessao: '#27AE60',
    tarefa: '#E74C3C',
    checkin: '#3498DB',
};

const WEEK_DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function MonthView({ date, events, allMonthEvents, onDayPress }: Props) {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

    const getDotsForDay = (day: Date): string[] => {
        const key = format(day, 'yyyy-MM-dd');
        const dayEvents = allMonthEvents.get(key) || [];
        const types = new Set(dayEvents.map(e => e.tipo_evento));
        return Array.from(types);
    };

    return (
        <View style={styles.container}>
            {/* Week day headers */}
            <View style={styles.weekHeader}>
                {WEEK_DAYS.map((d, i) => (
                    <View key={i} style={styles.weekHeaderCell}>
                        <Text style={styles.weekHeaderText}>{d}</Text>
                    </View>
                ))}
            </View>

            {/* Days grid */}
            <View style={styles.grid}>
                {days.map((day, idx) => {
                    const inMonth = isSameMonth(day, date);
                    const isSelected = isSameDay(day, date);
                    const isT = isToday(day);
                    const dots = getDotsForDay(day);

                    return (
                        <TouchableOpacity
                            key={idx}
                            style={[
                                styles.dayCell,
                                isSelected && styles.dayCellSelected,
                                isT && !isSelected && styles.dayCellToday,
                            ]}
                            onPress={() => {
                                onDayPress(day);
                            }}
                            activeOpacity={0.7}
                        >
                            <Text style={[
                                styles.dayNumber,
                                !inMonth && styles.dayNumberOutside,
                                isSelected && styles.dayNumberSelected,
                                isT && !isSelected && styles.dayNumberToday,
                            ]}>
                                {format(day, 'd')}
                            </Text>
                            {dots.length > 0 && (
                                <View style={styles.dotsRow}>
                                    {dots.slice(0, 3).map((type, i) => (
                                        <View
                                            key={i}
                                            style={[styles.dot, { backgroundColor: DOT_COLORS[type] || '#ccc' }]}
                                        />
                                    ))}
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        paddingBottom: 8,
    },
    weekHeader: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    weekHeaderCell: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
    },
    weekHeaderText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 12,
        color: '#A0AAB5',
        textTransform: 'uppercase',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: `${100 / 7}%`,
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        marginVertical: 2,
    },
    dayCellSelected: {
        backgroundColor: '#2C3E50',
    },
    dayCellToday: {
        backgroundColor: '#EBF5FB',
    },
    dayNumber: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 15,
        color: '#2C3E50',
    },
    dayNumberOutside: {
        color: '#D5D8DC',
    },
    dayNumberSelected: {
        color: '#FFFFFF',
    },
    dayNumberToday: {
        color: '#3498DB',
    },
    dotsRow: {
        flexDirection: 'row',
        marginTop: 2,
        gap: 2,
    },
    dot: {
        width: 5,
        height: 5,
        borderRadius: 3,
    },
});
