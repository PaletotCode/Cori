import { format, isSameDay } from 'date-fns';
import React, { useEffect, useRef } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { AgendaEvento, CheckInResponse, SessaoResponse, TarefaResponse } from '../../types/api';

interface Props {
    date: Date;
    events: AgendaEvento[];
    onSlotPress: (date: Date, hour: number) => void;
    onEventPress: (event: AgendaEvento) => void;
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7h–22h
const HOUR_HEIGHT = 72;

const ESTADO_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    agendada: { bg: '#3498DB22', border: '#3498DB', text: '#1A5276' },
    confirmada: { bg: '#27AE6022', border: '#27AE60', text: '#1A6B3C' },
    realizada: { bg: '#2ECC7122', border: '#2ECC71', text: '#17732A' },
    falta_cobrada: { bg: '#E74C3C22', border: '#E74C3C', text: '#922B21' },
    cancelada_paciente: { bg: '#95A5A622', border: '#95A5A6', text: '#616A6B' },
    remarcada: { bg: '#F39C1222', border: '#F39C12', text: '#7D6608' },
};

const ESTADO_LABELS: Record<string, string> = {
    agendada: 'Agendada',
    confirmada: 'Confirmada ✓',
    realizada: 'Realizada',
    falta_cobrada: 'Falta',
    cancelada_paciente: 'Cancelada',
    remarcada: 'Remarcada',
};

const EMOJI_HUMOR: Record<number, string> = { 1: '😢', 2: '😟', 3: '😐', 4: '🙂', 5: '😊' };

export default function DayView({ date, events, onSlotPress, onEventPress }: Props) {
    const scrollRef = useRef<ScrollView>(null);

    useEffect(() => {
        // Auto-scroll to current hour
        const currentHour = Math.max(new Date().getHours() - 7, 0);
        const scrollY = Math.max((currentHour - 1) * HOUR_HEIGHT, 0);
        setTimeout(() => scrollRef.current?.scrollTo({ y: scrollY, animated: true }), 200);
    }, [date]);

    const getEventsForDay = (): AgendaEvento[] => {
        return events.filter(e => isSameDay(new Date(e.data_hora), date));
    };

    const getTopOffset = (dateStr: string): number => {
        const d = new Date(dateStr);
        return (d.getHours() - 7) * HOUR_HEIGHT + (d.getMinutes() / 60) * HOUR_HEIGHT;
    };

    const getSessionHeight = (sessao: SessaoResponse): number => {
        const start = new Date(sessao.data_hora_inicio);
        const end = new Date(sessao.data_hora_fim);
        const durationH = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        return Math.max(durationH * HOUR_HEIGHT, 48);
    };

    const dayEvents = getEventsForDay();
    const sessions = dayEvents.filter(e => e.tipo_evento === 'sessao');
    const tasks = dayEvents.filter(e => e.tipo_evento === 'tarefa');
    const checkins = dayEvents.filter(e => e.tipo_evento === 'checkin');

    const totalHours = HOURS.length * HOUR_HEIGHT;

    return (
        <ScrollView ref={scrollRef} style={styles.container} showsVerticalScrollIndicator={false}>
            <View style={styles.grid}>
                {/* Time column */}
                <View style={styles.timeColumn}>
                    {HOURS.map(h => (
                        <View key={h} style={styles.timeslot}>
                            <Text style={styles.timeText}>{`${h < 10 ? '0' : ''}${h}:00`}</Text>
                        </View>
                    ))}
                </View>

                {/* Events column */}
                <View style={[styles.eventsColumn, { height: totalHours }]}>
                    {/* Hour grid lines — tappable */}
                    {HOURS.map(h => (
                        <TouchableOpacity
                            key={h}
                            style={styles.hourSlot}
                            onPress={() => onSlotPress(date, h)}
                            activeOpacity={0.5}
                        >
                            <View style={styles.hourLine} />
                        </TouchableOpacity>
                    ))}

                    {/* Session blocks */}
                    {sessions.map((event, idx) => {
                        const sessao = event.dados_especificos as SessaoResponse;
                        const top = getTopOffset(sessao.data_hora_inicio);
                        const height = getSessionHeight(sessao);
                        const cfg = ESTADO_COLORS[sessao.estado] || ESTADO_COLORS.agendada;
                        const label = ESTADO_LABELS[sessao.estado] || 'Sessão';
                        const pacNome = (sessao as any).paciente?.nome_completo || `Paciente #${sessao.paciente_id}`;
                        const timeStr = `${format(new Date(sessao.data_hora_inicio), 'HH:mm')} – ${format(new Date(sessao.data_hora_fim), 'HH:mm')}`;

                        return (
                            <TouchableOpacity
                                key={idx}
                                style={[
                                    styles.sessionBlock,
                                    {
                                        top,
                                        height,
                                        backgroundColor: cfg.bg,
                                        borderLeftColor: cfg.border,
                                    },
                                ]}
                                onPress={() => onEventPress(event)}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.sessionName, { color: cfg.text }]} numberOfLines={1}>
                                    {pacNome}
                                </Text>
                                <Text style={[styles.sessionTime, { color: cfg.border }]}>
                                    {timeStr}
                                </Text>
                                <Text style={[styles.sessionEstado, { color: cfg.text, opacity: 0.7 }]}>
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}

                    {/* Task pills */}
                    {tasks.map((event, idx) => {
                        const tarefa = event.dados_especificos as TarefaResponse;
                        const top = getTopOffset(event.data_hora);
                        const pacNome = (tarefa as any).paciente?.nome_completo || '';
                        const isDone = tarefa.status === 'concluida';

                        return (
                            <TouchableOpacity
                                key={`t-${idx}`}
                                style={[
                                    styles.pill,
                                    { top: top + 2, backgroundColor: isDone ? '#E8F8F5' : '#FDECEA' }
                                ]}
                                onPress={() => onEventPress(event)}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.pillText, { color: isDone ? '#27AE60' : '#E74C3C' }]}>
                                    📋 {tarefa.titulo}
                                    {pacNome ? ` · ${pacNome.split(' ')[0]}` : ''}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}

                    {/* Checkin pills */}
                    {checkins.map((event, idx) => {
                        const checkin = event.dados_especificos as CheckInResponse;
                        const top = getTopOffset(event.data_hora);
                        const pacNome = (checkin as any).paciente?.nome_completo || '';
                        const emoji = EMOJI_HUMOR[checkin.nivel_humor] || '😐';

                        return (
                            <TouchableOpacity
                                key={`c-${idx}`}
                                style={[styles.pill, { top: top + 20, backgroundColor: '#EBF5FB' }]}
                                onPress={() => onEventPress(event)}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.pillText, { color: '#3498DB' }]}>
                                    {emoji} Check-in{pacNome ? ` · ${pacNome.split(' ')[0]}` : ''}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            <View style={{ height: 120 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAFAFA',
    },
    grid: {
        flexDirection: 'row',
    },
    timeColumn: {
        width: 56,
        backgroundColor: '#FFFFFF',
    },
    timeslot: {
        height: HOUR_HEIGHT,
        paddingTop: 6,
        paddingHorizontal: 8,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
        alignItems: 'flex-end',
    },
    timeText: {
        fontFamily: 'Cori-Medium',
        fontSize: 11,
        color: '#BDC3C7',
    },
    eventsColumn: {
        flex: 1,
        position: 'relative',
        backgroundColor: '#FFFFFF',
        borderLeftWidth: 1,
        borderLeftColor: '#F0F0F0',
    },
    hourSlot: {
        height: HOUR_HEIGHT,
        justifyContent: 'flex-start',
    },
    hourLine: {
        height: 1,
        backgroundColor: '#F4F6F8',
        marginTop: 0,
    },
    sessionBlock: {
        position: 'absolute',
        left: 8,
        right: 8,
        borderRadius: 10,
        borderLeftWidth: 4,
        padding: 10,
        overflow: 'hidden',
    },
    sessionName: {
        fontFamily: 'Cori-Bold',
        fontSize: 14,
        marginBottom: 2,
    },
    sessionTime: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 12,
        marginBottom: 2,
    },
    sessionEstado: {
        fontFamily: 'Cori-Medium',
        fontSize: 11,
    },
    pill: {
        position: 'absolute',
        left: 8,
        right: 8,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    pillText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 12,
    },
});
