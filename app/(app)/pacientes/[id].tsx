/**
 * pacientes/[id].tsx — Orquestrador do Perfil do Paciente
 *
 * Responsabilidade: fetch de dados, gerência de estado e modais.
 * Rendering delegado a: PatientHeader e PatientTimeline.
 */
import { format, subDays } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ModalEditarPaciente from '../../../components/modals/ModalEditarPaciente';
import ModalNovaSessao from '../../../components/modals/ModalNovaSessao';
import ModalNovaTarefa from '../../../components/modals/ModalNovaTarefa';
import ModalNovoCheckin from '../../../components/modals/ModalNovoCheckin';
import SessaoDetalhesModal from '../../../components/modals/SessaoDetalhesModal';
import PatientHeader from '../../../components/patient/PatientHeader';
import PatientTimeline from '../../../components/patient/PatientTimeline';

import { api } from '../../../services/api';
import { AgendaEvento, AgendaGeralResponse, PacienteResponse, SessaoResponse } from '../../../types/api';

export default function PacienteProfileScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const pacienteId = Number(id);

    // ── Data ──────────────────────────────────────────────────────────────────
    const [paciente, setPaciente] = useState<PacienteResponse | null>(null);
    const [timeline, setTimeline] = useState<AgendaEvento[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Modal visibility ──────────────────────────────────────────────────────
    const [sessaoModal, setSessaoModal] = useState(false);
    const [tarefaModal, setTarefaModal] = useState(false);
    const [checkinModal, setCheckinModal] = useState(false);
    const [editModal, setEditModal] = useState(false);
    const [selectedSessao, setSelectedSessao] = useState<SessaoResponse | null>(null);
    const [sessaoDetalhesModal, setSessaoDetalhesModal] = useState(false);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        if (!id) return;
        setError(null);
        try {
            const [pacRes, timelineRes] = await Promise.all([
                api.get<PacienteResponse>(`/pacientes/${id}`),
                api.get<AgendaGeralResponse>(
                    `/agenda/${id}/timeline?data_inicio=${format(subDays(new Date(), 30), 'yyyy-MM-dd')}&data_fim=${format(new Date(), 'yyyy-MM-dd')}`
                ),
            ]);
            setPaciente(pacRes.data);
            setTimeline(timelineRes.data.eventos);
        } catch {
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

    const handleSessaoPress = (sessao: SessaoResponse) => {
        setSelectedSessao(sessao);
        setSessaoDetalhesModal(true);
    };

    // ── Loading / Error states ─────────────────────────────────────────────────
    if (loading) {
        return (
            <SafeAreaView style={styles.centeredFull} edges={['top', 'left', 'right']}>
                <ActivityIndicator size="large" color="#2C3E50" />
            </SafeAreaView>
        );
    }

    if (error || !paciente) {
        return (
            <SafeAreaView style={styles.centeredFull} edges={['top', 'left', 'right']}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
                    <ArrowLeft color="#2C3E50" size={20} />
                    <Text style={styles.backText}>Voltar</Text>
                </TouchableOpacity>
                <Text style={styles.errorTitle}>Oops!</Text>
                <Text style={styles.errorMsg}>{error ?? 'Paciente não encontrado.'}</Text>
            </SafeAreaView>
        );
    }

    // ── Main render ────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2C3E50" />
                }
            >
                <PatientHeader
                    paciente={paciente}
                    pacienteId={id!}
                    onEditPress={() => setEditModal(true)}
                    onAddSessao={() => setSessaoModal(true)}
                    onAddTarefa={() => setTarefaModal(true)}
                    onAddCheckin={() => setCheckinModal(true)}
                />

                <PatientTimeline
                    eventos={timeline}
                    onSessaoPress={handleSessaoPress}
                />
            </ScrollView>

            {/* ── Modals ── */}
            <ModalNovaSessao
                visible={sessaoModal}
                pacienteId={pacienteId}
                onClose={() => setSessaoModal(false)}
                onSuccess={fetchData}
            />
            <ModalNovaTarefa
                visible={tarefaModal}
                pacienteId={pacienteId}
                onClose={() => setTarefaModal(false)}
                onSuccess={fetchData}
            />
            <ModalNovoCheckin
                visible={checkinModal}
                pacienteId={pacienteId}
                onClose={() => setCheckinModal(false)}
                onSuccess={fetchData}
            />
            <SessaoDetalhesModal
                visible={sessaoDetalhesModal}
                sessao={selectedSessao}
                onClose={() => setSessaoDetalhesModal(false)}
                onStatusChange={fetchData}
            />
            <ModalEditarPaciente
                visible={editModal}
                onClose={() => setEditModal(false)}
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
    centeredFull: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FAF9F6',
        padding: 24,
    },
    backRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 24,
    },
    backText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 16,
        color: '#2C3E50',
    },
    errorTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 28,
        color: '#2C3E50',
        marginBottom: 8,
    },
    errorMsg: {
        fontFamily: 'Cori-Medium',
        fontSize: 15,
        color: '#A0AAB5',
        textAlign: 'center',
        lineHeight: 22,
    },
});
