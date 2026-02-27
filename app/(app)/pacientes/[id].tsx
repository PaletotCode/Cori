import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, BookOpen, DollarSign, MessageCircle, Phone, Settings2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Linking, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../services/api';
import { AgendaEvento, AgendaGeralResponse, CheckInResponse, PacienteResponse, SessaoResponse, TarefaResponse } from '../../../types/api';

import CheckinCard from '../../../components/cards/CheckinCard';
import SessaoCard from '../../../components/cards/SessaoCard';
import TarefaCard from '../../../components/cards/TarefaCard';
import ModalEditarPaciente from '../../../components/modals/ModalEditarPaciente';
import ModalNovaSessao from '../../../components/modals/ModalNovaSessao';
import ModalNovaTarefa from '../../../components/modals/ModalNovaTarefa';
import ModalNovoCheckin from '../../../components/modals/ModalNovoCheckin';
import SessaoDetalhesModal from '../../../components/modals/SessaoDetalhesModal';

export default function PacienteProfileScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();

    const [paciente, setPaciente] = useState<PacienteResponse | null>(null);
    const [timeline, setTimeline] = useState<AgendaEvento[]>([]);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Modals State
    const [sessaoModalVisible, setSessaoModalVisible] = useState(false);
    const [tarefaModalVisible, setTarefaModalVisible] = useState(false);
    const [checkinModalVisible, setCheckinModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);

    // Sessao Detalhes Modal State
    const [selectedSessao, setSelectedSessao] = useState<SessaoResponse | null>(null);
    const [sessaoDetalhesVisible, setSessaoDetalhesVisible] = useState(false);

    const fetchData = useCallback(async () => {
        if (!id) return;
        setError(null);
        try {
            // 1. Fetch Patient Header Info
            const pacRes = await api.get<PacienteResponse>(`/pacientes/${id}`);
            setPaciente(pacRes.data);

            // 2. Fetch Timeline (Last 30 days up to today + 7 days future)
            // Usually timeline is past, but for "Agenda" events passing future is nice to see what's next
            const today = new Date();
            const past30 = subDays(today, 30);

            const strStart = format(past30, 'yyyy-MM-dd');
            const strEnd = format(today, 'yyyy-MM-dd'); // API defaults to today if we want, but let's be explicit

            const timelineRes = await api.get<AgendaGeralResponse>(
                `/agenda/${id}/timeline?data_inicio=${strStart}&data_fim=${strEnd}`
            );

            setTimeline(timelineRes.data.eventos);

        } catch (err: any) {
            console.log('Profile Fetch Error:', err.message);
            setError('Não foi possível carregar os dados deste paciente.');
        }
    }, [id]);

    useEffect(() => {
        fetchData().finally(() => setLoading(false));
    }, [fetchData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData().finally(() => setRefreshing(false));
    }, [fetchData]);

    const handleWhatsApp = () => {
        if (paciente?.meios_comunicacao?.whatsapp) {
            const phone = paciente.meios_comunicacao.whatsapp.replace(/\D/g, '');
            Linking.openURL(`whatsapp://send?phone=${phone}`);
        }
    };

    const handleCall = () => {
        if (paciente?.meios_comunicacao?.emergencia || paciente?.meios_comunicacao?.whatsapp) {
            const phone = (paciente.meios_comunicacao.emergencia || paciente.meios_comunicacao.whatsapp)?.replace(/\D/g, '');
            Linking.openURL(`tel:${phone}`);
        }
    };

    const getInitials = (name?: string) => {
        if (!name) return '??';
        return name.substring(0, 2).toUpperCase();
    };

    // --- RENDERS ---

    const renderHeader = () => {
        if (!paciente) return null;
        return (
            <View style={styles.headerContainer}>

                {/* Top Navbar */}
                <View style={styles.navBar}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <ArrowLeft color="#2C3E50" size={24} />
                    </TouchableOpacity>
                    <Text style={styles.navTitle}>Perfil do Paciente</Text>
                    <TouchableOpacity style={styles.headerActionBtn} onPress={() => setEditModalVisible(true)}>
                        <Settings2 color="#2C3E50" size={24} />
                    </TouchableOpacity>
                </View>

                {/* Profile Info */}
                <View style={styles.profileRow}>
                    {paciente.foto_perfil_url ? (
                        <Image source={{ uri: paciente.foto_perfil_url }} style={styles.avatarLarge} />
                    ) : (
                        <View style={styles.avatarLargePlaceholder}>
                            <Text style={styles.avatarLargeText}>{getInitials(paciente.nome_completo)}</Text>
                        </View>
                    )}

                    <View style={styles.profileData}>
                        <Text style={styles.patientName}>{paciente.nome_completo}</Text>

                        <View style={styles.statsRow}>
                            {paciente.idade && (
                                <View style={styles.statBadge}>
                                    <Text style={styles.statText}>{paciente.idade} anos</Text>
                                </View>
                            )}
                            {paciente.tempo_atendimento_dias && (
                                <View style={styles.statBadge}>
                                    <Text style={styles.statText}>{(paciente.tempo_atendimento_dias / 30).toFixed(0)} meses</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </View>

                {/* Actions Row */}
                <View style={styles.actionsRow}>
                    <TouchableOpacity
                        style={[styles.actionBtn, !paciente.meios_comunicacao?.whatsapp && styles.actionBtnDisabled]}
                        onPress={handleWhatsApp}
                        disabled={!paciente.meios_comunicacao?.whatsapp}
                    >
                        <MessageCircle color={paciente.meios_comunicacao?.whatsapp ? "#27AE60" : "#A0AAB5"} size={20} />
                        <Text style={[styles.actionBtnText, { color: paciente.meios_comunicacao?.whatsapp ? "#27AE60" : "#A0AAB5" }]}>
                            WhatsApp
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionBtn, (!paciente.meios_comunicacao?.emergencia && !paciente.meios_comunicacao?.whatsapp) && styles.actionBtnDisabled]}
                        onPress={handleCall}
                        disabled={!paciente.meios_comunicacao?.emergencia && !paciente.meios_comunicacao?.whatsapp}
                    >
                        <Phone color="#2C3E50" size={20} />
                        <Text style={[styles.actionBtnText, { color: '#2C3E50' }]}>
                            Ligar
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* CTAs Row - Financeiro & Anotações */}
                <View style={styles.ctasRow}>
                    <TouchableOpacity
                        style={[styles.financeiroBtn, { flex: 1, marginRight: 8 }]}
                        onPress={() => router.push(`/pacientes/financeiro/${id}` as any)}
                    >
                        <DollarSign color="#27AE60" size={20} />
                        <Text style={styles.financeiroBtnText}>Financeiro</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.anotacoesBtn, { flex: 1, marginLeft: 8 }]}
                        onPress={() => router.push(`/pacientes/anotacoes/${id}` as any)}
                    >
                        <BookOpen color="#3498DB" size={20} />
                        <Text style={styles.anotacoesBtnText}>Anotações</Text>
                    </TouchableOpacity>
                </View>

                {/* Timeline Title and Actions */}
                <View style={styles.timelineHeader}>
                    <View>
                        <Text style={styles.timelineTitle}>Linha do Tempo</Text>
                        <Text style={styles.timelineSubtitle}>Últimos 30 dias</Text>
                    </View>

                    <View style={styles.timelineActions}>
                        <TouchableOpacity
                            style={styles.addBtnSessao}
                            onPress={() => setSessaoModalVisible(true)}
                        >
                            <Text style={styles.addBtnSessaoText}>+ Sessão</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.addBtnTarefa}
                            onPress={() => setTarefaModalVisible(true)}
                        >
                            <Text style={styles.addBtnTarefaText}>+ Tarefa</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.addBtnCheckin}
                            onPress={() => setCheckinModalVisible(true)}
                        >
                            <Text style={styles.addBtnCheckinText}>+ Humor</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    };

    const renderTimelineItem = ({ item, index }: { item: AgendaEvento, index: number }) => {
        // Determine Card component based on type
        let CardComponent = null;
        switch (item.tipo_evento) {
            case 'sessao':
                CardComponent = (
                    <SessaoCard
                        data={item.dados_especificos as SessaoResponse}
                        hidePatientInfo={true}
                        onPress={(sessao) => {
                            setSelectedSessao(sessao);
                            setSessaoDetalhesVisible(true);
                        }}
                    />
                );
                break;
            case 'tarefa':
                CardComponent = <TarefaCard data={item.dados_especificos as TarefaResponse} hidePatientInfo={true} />;
                break;
            case 'checkin':
                CardComponent = <CheckinCard data={item.dados_especificos as CheckInResponse} hidePatientInfo={true} />;
                break;
            default:
                return null; // Safety fallback
        }

        const isLast = index === timeline.length - 1;

        // Build the visual vertical timeline
        return (
            <View style={styles.timelineNode}>
                <View style={styles.timelineMarkerCol}>
                    <View style={styles.timelineDot} />
                    {!isLast && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineContentCol}>
                    <Text style={styles.timelineDate}>
                        {format(new Date(item.data_hora), "dd 'de' MMMM", { locale: ptBR })}
                    </Text>
                    {CardComponent}
                </View>
            </View>
        );
    };

    const renderEmptyState = () => (
        <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nenhum evento recente.</Text>
            <Text style={styles.emptySubtext}>A linha do tempo deste paciente está vazia.</Text>
        </View>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#2C3E50" />
                </View>
            ) : error ? (
                <View style={styles.centerContainer}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtnCentered}>
                        <ArrowLeft color="#2C3E50" size={24} />
                        <Text style={styles.backBtnText}>Voltar</Text>
                    </TouchableOpacity>
                    <Text style={styles.errorText}>Oops!</Text>
                    <Text style={styles.errorSubtext}>{error}</Text>
                </View>
            ) : (
                <FlatList
                    data={timeline}
                    keyExtractor={(item, idx) => `${item.tipo_evento}-${item.dados_especificos.id || idx}`}
                    ListHeaderComponent={renderHeader}
                    renderItem={renderTimelineItem}
                    ListEmptyComponent={renderEmptyState}
                    contentContainerStyle={styles.listContainer}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2C3E50" />
                    }
                />
            )}

            {/* Modals */}
            <ModalNovaSessao
                visible={sessaoModalVisible}
                pacienteId={Number(id)}
                onClose={() => setSessaoModalVisible(false)}
                onSuccess={() => fetchData()}
            />

            <ModalNovaTarefa
                visible={tarefaModalVisible}
                pacienteId={Number(id)}
                onClose={() => setTarefaModalVisible(false)}
                onSuccess={() => fetchData()}
            />

            <ModalNovoCheckin
                visible={checkinModalVisible}
                pacienteId={Number(id)}
                onClose={() => setCheckinModalVisible(false)}
                onSuccess={() => fetchData()}
            />

            <SessaoDetalhesModal
                visible={sessaoDetalhesVisible}
                sessao={selectedSessao}
                onClose={() => setSessaoDetalhesVisible(false)}
                onStatusChange={() => fetchData()}
            />

            {/* Edit/Delete User Modal */}
            <ModalEditarPaciente
                visible={editModalVisible}
                onClose={() => setEditModalVisible(false)}
                paciente={paciente}
                onSuccess={fetchData}
                onDeleted={() => router.back()}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAF9F6',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    headerContainer: {
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 24,
    },
    navBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    backBtn: {
        padding: 8,
        marginLeft: -8,
    },
    backBtnCentered: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    backBtnText: {
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#2C3E50',
        marginLeft: 8,
    },
    navTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#2C3E50',
    },
    headerActionBtn: {
        padding: 8,
        marginRight: -8,
    },
    profileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    avatarLarge: {
        width: 64,
        height: 64,
        borderRadius: 32,
        marginRight: 16,
    },
    avatarLargePlaceholder: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#EDF2F7',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    avatarLargeText: {
        fontFamily: 'Cori-Bold',
        fontSize: 24,
        color: '#34495E',
    },
    profileData: {
        flex: 1,
        justifyContent: 'center',
    },
    patientName: {
        fontFamily: 'Cori-Bold',
        fontSize: 22,
        color: '#2C3E50',
        marginBottom: 8,
    },
    statsRow: {
        flexDirection: 'row',
    },
    statBadge: {
        backgroundColor: '#EAECEE',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginRight: 8,
    },
    statText: {
        fontFamily: 'Cori-Medium',
        fontSize: 12,
        color: '#7F8C8D',
    },
    actionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 32,
    },
    actionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#EFEFEF',
        marginHorizontal: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1,
    },
    actionBtnDisabled: {
        backgroundColor: '#F9FBF9',
        borderColor: '#F0F0F0',
        shadowOpacity: 0,
        elevation: 0,
    },
    actionBtnText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 14,
        marginLeft: 8,
    },
    ctasRow: {
        flexDirection: 'row',
        marginBottom: 32,
    },
    financeiroBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#E8F5E9',
        borderWidth: 1,
        borderColor: '#C8E6C9',
        paddingVertical: 14,
        borderRadius: 12,
        shadowColor: '#27AE60',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    financeiroBtnText: {
        fontFamily: 'Cori-Bold',
        fontSize: 15,
        color: '#27AE60',
        marginLeft: 8,
    },
    anotacoesBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EBF5FB',
        borderWidth: 1,
        borderColor: '#D6EAF8',
        paddingVertical: 14,
        borderRadius: 12,
        shadowColor: '#3498DB',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    anotacoesBtnText: {
        fontFamily: 'Cori-Bold',
        fontSize: 15,
        color: '#3498DB',
        marginLeft: 8,
    },
    timelineHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
        paddingTop: 24,
        marginBottom: 16,
    },
    timelineTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 20,
        color: '#2C3E50',
    },
    timelineSubtitle: {
        fontFamily: 'Cori',
        fontSize: 14,
        color: '#A0AAB5',
        marginTop: 4,
    },
    timelineActions: {
        flexDirection: 'row',
    },
    addBtnSessao: {
        backgroundColor: '#E8F5E9',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        marginRight: 8,
    },
    addBtnSessaoText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 12,
        color: '#27AE60',
    },
    addBtnTarefa: {
        backgroundColor: '#FDECEA',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        marginRight: 8,
    },
    addBtnTarefaText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 12,
        color: '#E74C3C',
    },
    addBtnCheckin: {
        backgroundColor: '#EBF5FB',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    addBtnCheckinText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 12,
        color: '#3498DB',
    },
    listContainer: {
        paddingBottom: 48,
    },
    // Timeline visually
    timelineNode: {
        flexDirection: 'row',
        paddingHorizontal: 24,
    },
    timelineMarkerCol: {
        width: 20,
        alignItems: 'center',
        marginRight: 16,
    },
    timelineDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#3498DB',
        marginTop: 8, // aligns with the date text roughly
        zIndex: 2,
    },
    timelineLine: {
        width: 2,
        flex: 1,
        backgroundColor: '#EAECEE',
        marginTop: -4, // underlap
        marginBottom: -16, // overlap to next node
        zIndex: 1,
    },
    timelineContentCol: {
        flex: 1,
        paddingBottom: 24,
    },
    timelineDate: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 14,
        color: '#7F8C8D',
        marginBottom: 12,
        marginTop: 4,
    },
    // Utility
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 32,
        paddingHorizontal: 24,
    },
    emptyText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 16,
        color: '#34495E',
        marginBottom: 8,
        textAlign: 'center',
    },
    emptySubtext: {
        fontFamily: 'Cori',
        fontSize: 14,
        color: '#A0AAB5',
    },
    errorText: {
        fontFamily: 'Cori-Bold',
        fontSize: 24,
        color: '#E74C3C',
        marginBottom: 8,
    },
    errorSubtext: {
        fontFamily: 'Cori',
        fontSize: 14,
        color: '#7F8C8D',
        textAlign: 'center',
    }
});
