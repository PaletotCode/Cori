import {
    addDays,
    format,
    isSameDay,
    isToday,
    startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AgendaEvento, SessaoResponse } from '../../types/api';

interface Props {
    date: Date;
    events: AgendaEvento[];
    onSlotPress: (date: Date, hour: number) => void;
    onEventPress: (event: AgendaEvento) => void;
    onDayPress: (day: Date) => void;
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7h to 22h
const HOUR_HEIGHT = 64;
const DAY_COLUMNS = 7;

const ESTADO_COLORS: Record<string, string> = {
    agendada: '#3498DB',
    confirmada: '#27AE60',
    realizada: '#2ECC71',
    falta_cobrada: '#E74C3C',
    cancelada_paciente: '#95A5A6',
    remarcada: '#F39C12',
};

export default function WeekView({ date, events, onSlotPress, onEventPress, onDayPress }: Props) {
    const weekStart = startOfWeek(date, { weekStartsOn: 0 });
    const weekDays = Array.from({ length: DAY_COLUMNS }, (_, i) => addDays(weekStart, i));

    const getEventsForDay = (day: Date): AgendaEvento[] => {
        return events.filter(e => isSameDay(new Date(e.data_hora), day));
    };

    const getTopOffset = (dateStr: string): number => {
        const d = new Date(dateStr);
        return (d.getHours() - 7) * HOUR_HEIGHT + (d.getMinutes() / 60) * HOUR_HEIGHT;
    };

    const getSessionHeight = (sessao: SessaoResponse): number => {
        const start = new Date(sessao.data_hora_inicio);
        const end = new Date(sessao.data_hora_fim);
        const durationH = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        return Math.max(durationH * HOUR_HEIGHT, 32);
    };

    return (
        <View style={styles.container}>
            {/* Day headers */}
            <View style={styles.dayHeaders}>
                <View style={styles.timeLabelSpacer} />
                {weekDays.map((day, i) => {
                    const isSelected = isSameDay(day, date);
                    const isT = isToday(day);
                    return (
                        <TouchableOpacity
                            key={i}
                            style={styles.dayHeader}
                            onPress={() => onDayPress(day)}
                        >
                            <Text style={[styles.dayHeaderWeekday, isT && styles.todayText]}>
                                {format(day, 'EEE', { locale: ptBR }).substring(0, 3)}
                            </Text>
                            <View style={[
                                styles.dayHeaderNumber,
                                isSelected && styles.dayHeaderNumberSelected,
                                isT && !isSelected && styles.dayHeaderNumberToday,
                            ]}>
                                <Text style={[
                                    styles.dayHeaderNumberText,
                                    isSelected && styles.dayHeaderNumberTextSelected,
                                    isT && !isSelected && styles.todayText,
                                ]}>
                                    {format(day, 'd')}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Scrollable body */}
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                <View style={styles.grid}>
                    {/* Time labels column */}
                    <View style={styles.timeLabels}>
                        {HOURS.map(h => (
                            <View key={h} style={styles.timeLabelRow}>
                                <Text style={styles.timeLabel}>{h < 10 ? `0${h}` : h}h</Text>
                            </View>
                        ))}
                    </View>

                    {/* Day columns */}
                    {weekDays.map((day, dayIdx) => {
                        const dayEvents = getEventsForDay(day);
                        const sessions = dayEvents.filter(e => e.tipo_evento === 'sessao');

                        return (
                            <TouchableOpacity
                                key={dayIdx}
                                style={styles.dayColumn}
                                onPress={() => onSlotPress(day, new Date().getHours())}
                                activeOpacity={1}
                            >
                                {/* Hour lines */}
                                {HOURS.map(h => (
                                    <View key={h} style={styles.hourLine} />
                                ))}

                                {/* Session blocks */}
                                {sessions.map((event, ei) => {
                                    const sessao = event.dados_especificos as SessaoResponse;
                                    const top = getTopOffset(sessao.data_hora_inicio);
                                    const height = getSessionHeight(sessao);
                                    const color = ESTADO_COLORS[sessao.estado] || '#3498DB';
                                    const pacNome = (sessao as any).paciente?.nome_completo || '';

                                    return (
                                        <TouchableOpacity
                                            key={ei}
                                            style={[styles.sessionBlock, { top, height, backgroundColor: color + 'CC', borderLeftColor: color }]}
                                            onPress={() => onEventPress(event)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={styles.sessionBlockName} numberOfLines={2}>
                                                {pacNome.split(' ')[0]}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    dayHeaders: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
        paddingVertical: 8,
        backgroundColor: '#FFFFFF',
    },
    timeLabelSpacer: {
        width: 44,
    },
    dayHeader: {
        flex: 1,
        alignItems: 'center',
        gap: 4,
    },
    dayHeaderWeekday: {
        fontFamily: 'Cori-Medium',
        fontSize: 11,
        color: '#A0AAB5',
        textTransform: 'capitalize',
    },
    dayHeaderNumber: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayHeaderNumberSelected: {
        backgroundColor: '#2C3E50',
    },
    dayHeaderNumberToday: {
        backgroundColor: '#EBF5FB',
    },
    dayHeaderNumberText: {
        fontFamily: 'Cori-Bold',
        fontSize: 14,
        color: '#2C3E50',
    },
    dayHeaderNumberTextSelected: {
        color: '#FFFFFF',
    },
    todayText: {
        color: '#3498DB',
    },
    body: {
        flex: 1,
    },
    grid: {
        flexDirection: 'row',
    },
    timeLabels: {
        width: 44,
    },
    timeLabelRow: {
        height: HOUR_HEIGHT,
        justifyContent: 'flex-start',
        paddingTop: 4,
        paddingLeft: 6,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
    },
    timeLabel: {
        fontFamily: 'Cori-Medium',
        fontSize: 10,
        color: '#BDC3C7',
    },
    dayColumn: {
        flex: 1,
        position: 'relative',
        borderLeftWidth: 1,
        borderLeftColor: '#F4F6F8',
    },
    hourLine: {
        height: HOUR_HEIGHT,
        borderTopWidth: 1,
        borderTopColor: '#F4F6F8',
    },
    sessionBlock: {
        position: 'absolute',
        left: 2,
        right: 2,
        borderRadius: 6,
        borderLeftWidth: 3,
        padding: 4,
        overflow: 'hidden',
    },
    sessionBlockName: {
        fontFamily: 'Cori-Bold',
        fontSize: 10,
        color: '#FFFFFF',
    },
});
