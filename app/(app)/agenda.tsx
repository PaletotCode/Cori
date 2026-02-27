import {
    endOfMonth,
    endOfWeek,
    format,
    startOfMonth,
    startOfWeek
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useRouter } from 'expo-router';
import {
    BookOpen,
    Calendar,
    HeartPulse,
    Plus,
    X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CalendarHeader, { CalendarMode } from '../../components/calendar/CalendarHeader';
import DayView from '../../components/calendar/DayView';
import MonthView from '../../components/calendar/MonthView';
import WeekView from '../../components/calendar/WeekView';
import ModalNovaSessao from '../../components/modals/ModalNovaSessao';
import ModalNovoCheckin from '../../components/modals/ModalNovoCheckin';
import SessaoDetalhesModal from '../../components/modals/SessaoDetalhesModal';

import { api } from '../../services/api';
import { AgendaEvento, AgendaGeralResponse, PacienteResponse, SessaoResponse } from '../../types/api';

export default function AgendaScreen() {
    const router = useRouter();

    // Calendar state
    const [mode, setMode] = useState<CalendarMode>('day');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    // Data state
    const [events, setEvents] = useState<AgendaEvento[]>([]);
    const [monthEvents, setMonthEvents] = useState<AgendaEvento[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pacientes, setPacientes] = useState<PacienteResponse[]>([]);

    // Modal state
    const [selectedSessao, setSelectedSessao] = useState<SessaoResponse | null>(null);
    const [sessaoModalVisible, setSessaoModalVisible] = useState(false);
    const [novaSessaoVisible, setNovaSessaoVisible] = useState(false);
    const [novaSessaoPacienteId, setNovaSessaoPacienteId] = useState<number>(0);
    const [checkinVisible, setCheckinVisible] = useState(false);
    const [checkinPacienteId, setCheckinPacienteId] = useState<number>(0);

    // FAB animation
    const [fabOpen, setFabOpen] = useState(false);
    const fabAnim = useRef(new Animated.Value(0)).current;

    const toggleFab = () => {
        Animated.spring(fabAnim, {
            toValue: fabOpen ? 0 : 1,
            useNativeDriver: true,
            tension: 120,
            friction: 8,
        }).start();
        setFabOpen(!fabOpen);
    };

    const closeFab = () => {
        if (fabOpen) {
            Animated.spring(fabAnim, { toValue: 0, useNativeDriver: true, tension: 120, friction: 8 }).start();
            setFabOpen(false);
        }
    };

    // ── Data Fetching ──────────────────────────────────────────────────────────

    const getDateRange = useCallback((forMode: CalendarMode, forDate: Date) => {
        switch (forMode) {
            case 'day':
                return { start: forDate, end: forDate };
            case 'week': {
                const ws = startOfWeek(forDate, { weekStartsOn: 0 });
                const we = endOfWeek(forDate, { weekStartsOn: 0 });
                return { start: ws, end: we };
            }
            case 'month': {
                const ms = startOfMonth(forDate);
                const me = endOfMonth(forDate);
                return { start: ms, end: me };
            }
        }
    }, []);

    const fetchEvents = useCallback(async (forMode: CalendarMode, forDate: Date) => {
        try {
            const { start, end } = getDateRange(forMode, forDate);
            const dateStart = format(start, 'yyyy-MM-dd');
            const dateEnd = format(end, 'yyyy-MM-dd');

            const res = await api.get<AgendaGeralResponse>(
                `/agenda/geral?data_inicio=${dateStart}&data_fim=${dateEnd}`
            );
            setEvents(res.data.eventos || []);

            // For month view: also fetch current month data for dot indicators
            if (forMode !== 'month') {
                const ms = format(startOfMonth(forDate), 'yyyy-MM-dd');
                const me = format(endOfMonth(forDate), 'yyyy-MM-dd');
                const mRes = await api.get<AgendaGeralResponse>(
                    `/agenda/geral?data_inicio=${ms}&data_fim=${me}`
                );
                setMonthEvents(mRes.data.eventos || []);
            } else {
                setMonthEvents(res.data.eventos || []);
            }
        } catch (err) {
            console.error('fetchEvents error:', err);
        }
    }, [getDateRange]);

    const fetchPacientes = useCallback(async () => {
        try {
            const res = await api.get<PacienteResponse[]>('/pacientes/');
            setPacientes(res.data.filter(p => p.status === 'ativo'));
        } catch (err) {
            console.error('fetchPacientes error:', err);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchEvents(mode, selectedDate), fetchPacientes()])
            .finally(() => setLoading(false));
    }, [mode, selectedDate]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchEvents(mode, selectedDate).finally(() => setRefreshing(false));
    }, [mode, selectedDate, fetchEvents]);

    // ── Event map for MonthView dots ──────────────────────────────────────────

    const allMonthEventsMap = useMemo(() => {
        const map = new Map<string, AgendaEvento[]>();
        monthEvents.forEach(e => {
            const key = format(new Date(e.data_hora), 'yyyy-MM-dd');
            map.set(key, [...(map.get(key) || []), e]);
        });
        return map;
    }, [monthEvents]);

    // ── Action handlers ────────────────────────────────────────────────────────

    const handleEventPress = (event: AgendaEvento) => {
        closeFab();
        if (event.tipo_evento === 'sessao') {
            const sessao = event.dados_especificos as SessaoResponse;
            setSelectedSessao({ ...sessao, paciente: (event.dados_especificos as any).paciente });
            setSessaoModalVisible(true);
        } else if (event.tipo_evento === 'tarefa') {
            const pacId = (event.dados_especificos as any).paciente_id;
            if (pacId) router.push(`/pacientes/${pacId}` as any);
        } else if (event.tipo_evento === 'checkin') {
            const pacId = (event.dados_especificos as any).paciente_id;
            if (pacId) router.push(`/pacientes/${pacId}` as any);
        }
    };

    const handleSlotPress = (date: Date, hour: number) => {
        closeFab();
        setSelectedDate(date);
        setNovaSessaoPacienteId(pacientes[0]?.id || 0);
        setNovaSessaoVisible(true);
    };

    const handleMonthDayPress = (day: Date) => {
        setSelectedDate(day);
        setMode('day');
    };

    const handleShareConfirmation = async (sessao: SessaoResponse) => {
        const token = (sessao as any).token_confirmacao;
        if (!token) return;
        const link = `https://cori.app/confirmar/${token}`;
        try {
            await Share.share({
                message: `Olá! Confirme sua presença na sessão: ${link}`,
                url: link,
            });
        } catch { }
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    const firstActivePacienteId = pacientes[0]?.id || 0;

    const fabRotate = fabAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });
    const fabScale1 = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const fabScale2 = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const fabScale3 = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const fab1Y = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -60] });
    const fab2Y = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -120] });
    const fab3Y = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -180] });

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>

            {/* Header title */}
            <View style={styles.pageHeader}>
                <Text style={styles.pageTitle}>Agenda</Text>
                <Text style={styles.pageSubtitle}>{format(selectedDate, 'EEEE', { locale: ptBR })}</Text>
            </View>

            {/* Calendar header (mode switcher + nav) */}
            <CalendarHeader
                mode={mode}
                date={selectedDate}
                onModeChange={(m) => { setMode(m); closeFab(); }}
                onDateChange={setSelectedDate}
            />

            {/* Calendar body */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#2C3E50" />
                </View>
            ) : (
                <>
                    {mode === 'month' && (
                        <>
                            <MonthView
                                date={selectedDate}
                                events={events}
                                allMonthEvents={allMonthEventsMap}
                                onDayPress={handleMonthDayPress}
                            />
                            {/* Event list for selected day in month mode */}
                            <ScrollView
                                style={styles.monthEventList}
                                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2C3E50" />}
                            >
                                <Text style={styles.dayEventTitle}>
                                    {format(selectedDate, 'dd/MM')} — Eventos
                                </Text>
                                {(allMonthEventsMap.get(format(selectedDate, 'yyyy-MM-dd')) || []).length === 0 ? (
                                    <View style={styles.emptyBox}>
                                        <Text style={styles.emptyText}>Dia livre. Toque num horário para agendar.</Text>
                                    </View>
                                ) : (
                                    (allMonthEventsMap.get(format(selectedDate, 'yyyy-MM-dd')) || [])
                                        .sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())
                                        .map((e, idx) => renderEventRow(e, idx, handleEventPress))
                                )}
                            </ScrollView>
                        </>
                    )}

                    {mode === 'week' && (
                        <WeekView
                            date={selectedDate}
                            events={events}
                            onSlotPress={handleSlotPress}
                            onEventPress={(e) => { if (e.tipo_evento === 'sessao') handleEventPress(e); else handleEventPress(e); }}
                            onDayPress={(d) => { setSelectedDate(d); setMode('day'); }}
                        />
                    )}

                    {mode === 'day' && (
                        <DayView
                            date={selectedDate}
                            events={events}
                            onSlotPress={handleSlotPress}
                            onEventPress={handleEventPress}
                        />
                    )}
                </>
            )}

            {/* Backdrop when FAB open */}
            {fabOpen && (
                <TouchableOpacity style={styles.fabBackdrop} onPress={closeFab} activeOpacity={1} />
            )}

            {/* FAB group */}
            <View style={styles.fabContainer} pointerEvents="box-none">
                {/* Sub-FABs */}
                <Animated.View style={[styles.subFabWrapper, { transform: [{ translateY: fab3Y }, { scale: fabScale3 }] }]}>
                    <TouchableOpacity
                        style={[styles.subFab, { backgroundColor: '#3498DB' }]}
                        onPress={() => { closeFab(); setCheckinPacienteId(firstActivePacienteId); setCheckinVisible(true); }}
                    >
                        <HeartPulse color="#FFF" size={20} />
                    </TouchableOpacity>
                    <Text style={styles.subFabLabel}>Humor</Text>
                </Animated.View>

                <Animated.View style={[styles.subFabWrapper, { transform: [{ translateY: fab2Y }, { scale: fabScale2 }] }]}>
                    <TouchableOpacity
                        style={[styles.subFab, { backgroundColor: '#27AE60' }]}
                        onPress={() => { closeFab(); router.push('/pacientes' as any); }}
                    >
                        <BookOpen color="#FFF" size={20} />
                    </TouchableOpacity>
                    <Text style={styles.subFabLabel}>Tarefa</Text>
                </Animated.View>

                <Animated.View style={[styles.subFabWrapper, { transform: [{ translateY: fab1Y }, { scale: fabScale1 }] }]}>
                    <TouchableOpacity
                        style={[styles.subFab, { backgroundColor: '#F39C12' }]}
                        onPress={() => { closeFab(); setNovaSessaoPacienteId(firstActivePacienteId); setNovaSessaoVisible(true); }}
                    >
                        <Calendar color="#FFF" size={20} />
                    </TouchableOpacity>
                    <Text style={styles.subFabLabel}>Sessão</Text>
                </Animated.View>

                {/* Main FAB */}
                <TouchableOpacity style={styles.fab} onPress={toggleFab} activeOpacity={0.8}>
                    <Animated.View style={{ transform: [{ rotate: fabRotate }] }}>
                        {fabOpen
                            ? <X color="#FFF" size={28} />
                            : <Plus color="#FFF" size={28} />
                        }
                    </Animated.View>
                </TouchableOpacity>
            </View>

            {/* Modals */}
            <SessaoDetalhesModal
                visible={sessaoModalVisible}
                sessao={selectedSessao}
                onClose={() => setSessaoModalVisible(false)}
                onStatusChange={() => fetchEvents(mode, selectedDate)}
                onShare={handleShareConfirmation}
            />

            <ModalNovaSessao
                visible={novaSessaoVisible}
                pacienteId={novaSessaoPacienteId || (pacientes[0]?.id || 0)}
                onClose={() => setNovaSessaoVisible(false)}
                onSuccess={() => {
                    setNovaSessaoVisible(false);
                    fetchEvents(mode, selectedDate);
                }}
            />

            <ModalNovoCheckin
                visible={checkinVisible}
                pacienteId={checkinPacienteId}
                onClose={() => setCheckinVisible(false)}
                onSuccess={() => fetchEvents(mode, selectedDate)}
            />
        </SafeAreaView>
    );
}

// ── Shared event row renderer (used by Month view's event list) ──────────────

function renderEventRow(event: AgendaEvento, idx: number, onPress: (e: AgendaEvento) => void) {
    const tipo = event.tipo_evento;
    const data = event.dados_especificos;
    const hora = format(new Date(event.data_hora), 'HH:mm');
    const pacNome = (data as any).paciente?.nome_completo || '';

    let icon = '📅';
    let label = '';
    let color = '#3498DB';
    let bg = '#EBF5FB';

    if (tipo === 'sessao') {
        const s = data as SessaoResponse;
        icon = s.estado === 'realizada' ? '✅' : s.estado === 'falta_cobrada' ? '❌' : '📅';
        label = `Sessão · ${s.estado}`;
        color = '#3498DB';
        bg = '#EBF5FB';
    } else if (tipo === 'tarefa') {
        icon = '📋';
        label = `Tarefa: ${(data as any).titulo}`;
        color = '#E74C3C';
        bg = '#FDECEA';
    } else if (tipo === 'checkin') {
        icon = '💚';
        label = `Check-in · humor ${(data as any).nivel_humor}/5`;
        color = '#27AE60';
        bg = '#E8F8F5';
    }

    return (
        <TouchableOpacity
            key={`ev-${tipo}-${(data as any).id}-${idx}`}
            style={[eventStyles.row, { borderLeftColor: color, backgroundColor: bg }]}
            onPress={() => onPress(event)}
            activeOpacity={0.7}
        >
            <Text style={eventStyles.icon}>{icon}</Text>
            <View style={eventStyles.info}>
                {pacNome ? <Text style={eventStyles.pac}>{pacNome}</Text> : null}
                <Text style={[eventStyles.label, { color }]}>{label}</Text>
            </View>
            <Text style={eventStyles.hora}>{hora}</Text>
        </TouchableOpacity>
    );
}

const eventStyles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        borderLeftWidth: 4,
        padding: 12,
        marginBottom: 8,
    },
    icon: { fontSize: 20, marginRight: 12 },
    info: { flex: 1 },
    pac: { fontFamily: 'Cori-SemiBold', fontSize: 14, color: '#2C3E50', marginBottom: 2 },
    label: { fontFamily: 'Cori-Medium', fontSize: 12 },
    hora: { fontFamily: 'Cori-Bold', fontSize: 13, color: '#A0AAB5' },
});

// ── Main styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAF9F6',
    },
    pageHeader: {
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 8,
        backgroundColor: '#FFFFFF',
    },
    pageTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 30,
        color: '#2C3E50',
        letterSpacing: -0.5,
    },
    pageSubtitle: {
        fontFamily: 'Cori-Medium',
        fontSize: 14,
        color: '#A0AAB5',
        textTransform: 'capitalize',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ── Month view event list ─────────────────────────────────────────────────
    monthEventList: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    dayEventTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#2C3E50',
        marginBottom: 10,
    },
    emptyBox: {
        padding: 20,
        alignItems: 'center',
    },
    emptyText: {
        fontFamily: 'Cori-Medium',
        fontSize: 14,
        color: '#A0AAB5',
        textAlign: 'center',
    },

    // ── FAB ──────────────────────────────────────────────────────────────────
    fabBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.15)',
    },
    fabContainer: {
        position: 'absolute',
        right: 20,
        bottom: 32,
        alignItems: 'center',
    },
    fab: {
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: '#2C3E50',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#2C3E50',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
    },
    subFabWrapper: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
    },
    subFab: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 5,
    },
    subFabLabel: {
        position: 'absolute',
        right: 54,
        fontFamily: 'Cori-Bold',
        fontSize: 13,
        color: '#2C3E50',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
});
