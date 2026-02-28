import { format, formatDistanceToNow, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useRouter } from 'expo-router';
import {
    AlertTriangle,
    BookOpen,
    Calendar,
    CheckCircle,
    Clock,
    DollarSign,
    Frown,
    Heart,
    Meh,
    Settings,
    Smile,
    UserX,
    XCircle,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { AgendaEvento, AgendaGeralResponse, CheckInResponse, PacienteResponse, SessaoResponse, TarefaResponse } from '../../types/api';

// ── Tipos locais ──────────────────────────────────────────────────────────────

interface FaturaPendente {
    id: number;
    paciente_id: number;
    paciente: { id: number; nome_completo: string; foto_perfil_url?: string };
    mes_referencia: number;
    ano_referencia: number;
    valor_total: number;
    estado: 'pendente' | 'atrasada';
    data_vencimento: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
};

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    agendada: { label: 'Agendada', color: '#3498DB', bg: '#EBF5FB' },
    confirmada: { label: 'Confirmada', color: '#27AE60', bg: '#E8F5E9' },
    realizada: { label: 'Realizada', color: '#2ECC71', bg: '#E8F8F5' },
    falta_cobrada: { label: 'Falta', color: '#E74C3C', bg: '#FDECEA' },
    cancelada_paciente: { label: 'Cancelada', color: '#95A5A6', bg: '#F5F5F5' },
    remarcada: { label: 'Remarcada', color: '#F39C12', bg: '#FEF5E7' },
};

// ── Home ──────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
    const router = useRouter();
    const { psicologo } = useAuthStore();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [sesToday, setSesToday] = useState<SessaoResponse[]>([]);
    const [atividades, setAtividades] = useState<AgendaEvento[]>([]);
    const [faturasPendentes, setFaturasPendentes] = useState<FaturaPendente[]>([]);
    const [pacientesPendentes, setPacientesPendentes] = useState<PacienteResponse[]>([]);
    const [totalAtivos, setTotalAtivos] = useState(0);

    const fetchDashboard = useCallback(async () => {
        try {
            const today = format(new Date(), 'yyyy-MM-dd');
            const pastWeek = format(new Date(Date.now() - 7 * 86400000), 'yyyy-MM-dd');

            const [pacRes, agendaRes, faturasRes] = await Promise.all([
                api.get<PacienteResponse[]>('/pacientes/'),
                api.get<AgendaGeralResponse>(`/agenda/geral?data_inicio=${pastWeek}&data_fim=${today}`),
                api.get<FaturaPendente[]>('/faturas/pendentes'),
            ]);

            const todos = pacRes.data;
            const ativos = todos.filter(p => p.status === 'ativo');
            setTotalAtivos(ativos.length);

            // Sessões de hoje
            const todaySessions = (agendaRes.data.eventos || [])
                .filter(e => e.tipo_evento === 'sessao' && isToday(new Date(e.data_hora)))
                .map(e => e.dados_especificos as SessaoResponse)
                .sort((a, b) => new Date(a.data_hora_inicio).getTime() - new Date(b.data_hora_inicio).getTime());
            setSesToday(todaySessions);

            // Atividades recentes (últimos 7 dias, todos os tipos)
            const recentes = [...(agendaRes.data.eventos || [])]
                .sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime())
                .slice(0, 25);
            setAtividades(recentes);

            setFaturasPendentes(faturasRes.data);
        } catch (error) {
            console.error('Dashboard fetch error:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchDashboard().finally(() => setRefreshing(false));
    }, [fetchDashboard]);

    // ── KPI computations ───────────────────────────────────────────────────────

    const ticketDia = sesToday
        .filter(s => ['realizada', 'falta_cobrada', 'confirmada', 'agendada'].includes(s.estado))
        .reduce((acc, s) => acc + (s.valor_cobrado || 0), 0);

    const sesConfirmadas = sesToday.filter(s => s.estado === 'confirmada').length;
    const sesTotalHoje = sesToday.length;

    // ── Loading ────────────────────────────────────────────────────────────────

    if (loading && totalAtivos === 0 && pacientesPendentes.length === 0) {
        return (
            <SafeAreaView style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#2C3E50" />
            </SafeAreaView>
        );
    }


    // ── Render helpers  ────────────────────────────────────────────────────────

    const renderAtividadeItem = (evento: AgendaEvento, index: number) => {
        const data = evento.dados_especificos;
        const tipo = evento.tipo_evento;
        const pacNome = (data as any).paciente?.nome_completo || 'Paciente';
        const pacId = (data as any).paciente_id || (data as any).paciente?.id;
        const dataHora = new Date(evento.data_hora);
        const distancia = formatDistanceToNow(dataHora, { addSuffix: true, locale: ptBR });

        let icon = null;
        let cor = '#3498DB';
        let descricao = '';

        if (tipo === 'sessao') {
            const s = data as SessaoResponse;
            const cfg = ESTADO_CONFIG[s.estado] || ESTADO_CONFIG.agendada;
            cor = cfg.color;
            descricao = `Sessão ${cfg.label.toLowerCase()}`;
            if (s.estado === 'realizada') icon = <CheckCircle color={cor} size={20} />;
            else if (s.estado === 'falta_cobrada') icon = <UserX color={cor} size={20} />;
            else if (s.estado === 'cancelada_paciente') icon = <XCircle color={cor} size={20} />;
            else icon = <Calendar color={cor} size={20} />;
        } else if (tipo === 'checkin') {
            const c = data as CheckInResponse;
            cor = '#E74C3C';
            const nivel = c.nivel_humor;
            descricao = `Check-in — humor ${nivel}/5`;
            if (nivel >= 4) icon = <Smile color={cor} size={20} />;
            else if (nivel === 3) icon = <Meh color={cor} size={20} />;
            else icon = <Frown color={cor} size={20} />;
            cor = nivel >= 4 ? '#27AE60' : nivel === 3 ? '#F39C12' : '#E74C3C';
        } else if (tipo === 'tarefa') {
            const t = data as TarefaResponse;
            cor = t.status === 'concluida' ? '#27AE60' : '#E74C3C';
            descricao = `Tarefa: ${t.titulo}`;
            icon = <BookOpen color={cor} size={20} />;
        }

        return (
            <TouchableOpacity
                key={`${tipo}-${(data as any).id}-${index}`}
                style={styles.activityCard}
                onPress={() => pacId && router.push(`/pacientes/${pacId}` as any)}
                activeOpacity={0.7}
            >
                <View style={[styles.activityIconBg, { backgroundColor: cor + '22' }]}>
                    {icon || <Heart color={cor} size={20} />}
                </View>
                <View style={styles.activityContent}>
                    <Text style={styles.activityPatient} numberOfLines={1}>{pacNome}</Text>
                    <Text style={styles.activityDesc} numberOfLines={1}>{descricao}</Text>
                </View>
                <Text style={styles.activityTime}>{distancia}</Text>
            </TouchableOpacity>
        );
    };

    const renderSessaoHoje = (sessao: SessaoResponse) => {
        const cfg = ESTADO_CONFIG[sessao.estado] || ESTADO_CONFIG.agendada;
        const hora = format(new Date(sessao.data_hora_inicio), 'HH:mm');
        const pacName = (sessao as any).paciente?.nome_completo || `Paciente #${sessao.paciente_id}`;
        const pacId = sessao.paciente_id;

        return (
            <TouchableOpacity
                key={sessao.id}
                style={styles.sessaoCard}
                onPress={() => router.push(`/pacientes/${pacId}` as any)}
                activeOpacity={0.7}
            >
                <View style={styles.sessaoAvatarContainer}>
                    <View style={styles.sessaoAvatar}>
                        <Text style={styles.sessaoAvatarText}>{pacName.substring(0, 2).toUpperCase()}</Text>
                    </View>
                </View>
                <View style={styles.sessaoInfo}>
                    <Text style={styles.sessaoPaciente} numberOfLines={1}>{pacName}</Text>
                    <View style={styles.sessaoHoraRow}>
                        <Clock color="#A0AAB5" size={14} />
                        <Text style={styles.sessaoHora}>{hora}</Text>
                    </View>
                </View>
                <View style={[styles.sessaoEstadoBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.sessaoEstadoText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    const renderFaturaPendente = (fatura: FaturaPendente) => {
        const vencimento = new Date(fatura.data_vencimento);
        const isAtrasada = fatura.estado === 'atrasada';
        const cor = isAtrasada ? '#E74C3C' : '#F39C12';
        const bg = isAtrasada ? '#FDECEA' : '#FEF5E7';

        return (
            <TouchableOpacity
                key={fatura.id}
                style={styles.faturaCard}
                onPress={() => router.push(`/pacientes/financeiro/${fatura.paciente_id}` as any)}
                activeOpacity={0.7}
            >
                <View style={[styles.faturaStatusDot, { backgroundColor: cor }]} />
                <View style={styles.faturaInfo}>
                    <Text style={styles.faturaPaciente} numberOfLines={1}>{fatura.paciente.nome_completo}</Text>
                    <Text style={styles.faturaMes}>
                        {MESES[fatura.mes_referencia - 1]}/{fatura.ano_referencia}
                    </Text>
                </View>
                <View style={styles.faturaRight}>
                    <Text style={[styles.faturaValor, { color: cor }]}>
                        R$ {Number(fatura.valor_total).toFixed(2).replace('.', ',')}
                    </Text>
                    <View style={[styles.faturaBadge, { backgroundColor: bg }]}>
                        <Text style={[styles.faturaBadgeText, { color: cor }]}>
                            {isAtrasada ? 'Atrasada' : 'Pendente'}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    // ── Main render ────────────────────────────────────────────────────────────

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>

            {/* ── Navbar ── */}
            <View style={styles.navbar}>
                <View>
                    <Text style={styles.greeting}>{getGreeting()},</Text>
                    <Text style={styles.nome}>{psicologo?.nome_exibicao || 'Doutor(a)'}</Text>
                </View>
                <TouchableOpacity style={styles.settingsBtn} onPress={() => router.push('/settings')}>
                    <Settings color="#2C3E50" size={22} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2C3E50" />}
            >

                {/* ── KPI Bar ── */}
                <View style={styles.kpiBar}>
                    <View style={[styles.kpiCard, { flex: 1.4, marginRight: 10, backgroundColor: '#2C3E50' }]}>
                        <View style={styles.kpiIconBg}>
                            <DollarSign color="#FFFFFF66" size={20} />
                        </View>
                        <Text style={[styles.kpiValue, { color: '#FFFFFF' }]}>
                            R$ {ticketDia.toFixed(2).replace('.', ',')}
                        </Text>
                        <Text style={[styles.kpiLabel, { color: '#FFFFFF99' }]}>Ticket de hoje</Text>
                    </View>
                    <View style={[styles.kpiCard, { flex: 1, backgroundColor: '#FFFFFF' }]}>
                        <View style={[styles.kpiIconBg, { backgroundColor: '#E8F5E9' }]}>
                            <CheckCircle color="#27AE60" size={20} />
                        </View>
                        <Text style={[styles.kpiValue, { color: '#2C3E50' }]}>
                            {sesConfirmadas}/{sesTotalHoje}
                        </Text>
                        <Text style={[styles.kpiLabel, { color: '#A0AAB5' }]}>Confirmados</Text>
                    </View>
                </View>

                {/* ── Atendimentos de Hoje ── */}
                <View style={styles.section}>
                    <View style={styles.sectionTitleRow}>
                        <Calendar color="#2C3E50" size={18} />
                        <Text style={styles.sectionTitle}>
                            Atendimentos de Hoje {sesTotalHoje > 0 ? `(${sesTotalHoje})` : ''}
                        </Text>
                    </View>
                    {sesTotalHoje === 0 ? (
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyText}>Nenhuma sessão agendada para hoje.</Text>
                        </View>
                    ) : (
                        sesToday.map(renderSessaoHoje)
                    )}
                </View>

                {/* ── Atividades Recentes ── */}
                <View style={styles.section}>
                    <View style={styles.sectionTitleRow}>
                        <Clock color="#2C3E50" size={18} />
                        <Text style={styles.sectionTitle}>Atividades Recentes</Text>
                    </View>
                    {atividades.length === 0 ? (
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyText}>Nenhuma atividade nos últimos 7 dias.</Text>
                        </View>
                    ) : (
                        atividades.map(renderAtividadeItem)
                    )}
                </View>

                {/* ── Pendências Financeiras ── */}
                <View style={[styles.section, { marginBottom: 0 }]}>
                    <View style={styles.sectionTitleRow}>
                        <DollarSign color="#2C3E50" size={18} />
                        <Text style={styles.sectionTitle}>
                            Pendências Financeiras {faturasPendentes.length > 0 ? `(${faturasPendentes.length})` : ''}
                        </Text>
                    </View>
                    {faturasPendentes.length === 0 ? (
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyText}>🎉 Nenhuma pendência em aberto!</Text>
                        </View>
                    ) : (
                        faturasPendentes.map(renderFaturaPendente)
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FAF9F6',
    },
    container: {
        flex: 1,
        backgroundColor: '#F4F6F8',
    },
    navbar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 16,
        backgroundColor: '#FAF9F6',
    },
    greeting: {
        fontFamily: 'Cori-Medium',
        fontSize: 14,
        color: '#A0AAB5',
    },
    nome: {
        fontFamily: 'Cori-Bold',
        fontSize: 22,
        color: '#2C3E50',
        letterSpacing: -0.5,
    },
    settingsBtn: {
        padding: 10,
        backgroundColor: '#EDF2F7',
        borderRadius: 20,
    },
    content: {
        paddingHorizontal: 20,
        paddingTop: 8,
    },

    // ── KPI ─────────────────────────────────────────
    kpiBar: {
        flexDirection: 'row',
        marginBottom: 24,
    },
    kpiCard: {
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
    },
    kpiIconBg: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FFFFFF22',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    kpiValue: {
        fontFamily: 'Cori-Bold',
        fontSize: 22,
        marginBottom: 4,
    },
    kpiLabel: {
        fontFamily: 'Cori-Medium',
        fontSize: 13,
    },

    // ── Section ─────────────────────────────────────
    section: {
        marginBottom: 28,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
        gap: 8,
    },
    sectionTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#2C3E50',
    },

    // ── Empty State ──────────────────────────────────
    emptyCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
    },
    emptyText: {
        fontFamily: 'Cori-Medium',
        fontSize: 15,
        color: '#A0AAB5',
    },

    // ── Pendentes de Triagem ─────────────────────────
    cardPendente: {
        backgroundColor: '#FEF9E7',
        borderWidth: 1,
        borderColor: '#FAD7A1',
        borderRadius: 14,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    cardInfo: {
        flex: 1,
        marginRight: 12,
    },
    pacienteNome: {
        fontFamily: 'Cori-Bold',
        fontSize: 15,
        color: '#2C3E50',
        marginBottom: 2,
    },
    pacienteMotivo: {
        fontFamily: 'Cori-Medium',
        fontSize: 12,
        color: '#7F8C8D',
        fontStyle: 'italic',
    },
    btnAprovar: {
        backgroundColor: '#F39C12',
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 10,
    },
    btnAprovarText: {
        fontFamily: 'Cori-Bold',
        fontSize: 13,
        color: '#FFFFFF',
    },

    // ── Sessões de Hoje ──────────────────────────────
    sessaoCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
    },
    sessaoAvatarContainer: {
        marginRight: 14,
    },
    sessaoAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#EDF2F7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sessaoAvatarText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#2C3E50',
    },
    sessaoInfo: {
        flex: 1,
    },
    sessaoPaciente: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 15,
        color: '#2C3E50',
        marginBottom: 4,
    },
    sessaoHoraRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    sessaoHora: {
        fontFamily: 'Cori-Medium',
        fontSize: 13,
        color: '#A0AAB5',
    },
    sessaoEstadoBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    sessaoEstadoText: {
        fontFamily: 'Cori-Bold',
        fontSize: 12,
    },

    // ── Atividades Recentes ──────────────────────────
    activityCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1,
    },
    activityIconBg: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    activityContent: {
        flex: 1,
    },
    activityPatient: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 14,
        color: '#2C3E50',
        marginBottom: 2,
    },
    activityDesc: {
        fontFamily: 'Cori-Medium',
        fontSize: 12,
        color: '#7F8C8D',
    },
    activityTime: {
        fontFamily: 'Cori-Medium',
        fontSize: 11,
        color: '#BDC3C7',
        marginLeft: 8,
    },

    // ── Faturas Pendentes ────────────────────────────
    faturaCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
    },
    faturaStatusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 14,
    },
    faturaInfo: {
        flex: 1,
    },
    faturaPaciente: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 15,
        color: '#2C3E50',
        marginBottom: 2,
    },
    faturaMes: {
        fontFamily: 'Cori-Medium',
        fontSize: 12,
        color: '#A0AAB5',
    },
    faturaRight: {
        alignItems: 'flex-end',
    },
    faturaValor: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        marginBottom: 4,
    },
    faturaBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    faturaBadgeText: {
        fontFamily: 'Cori-Bold',
        fontSize: 11,
    },
});
