import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../../services/api';
import { PacienteResponse } from '../../../types/api';

// Components
import PacienteCard from '../../../components/cards/PacienteCard';
import ModalAprovacaoPaciente from '../../../components/modals/ModalAprovacaoPaciente';
import ModalNovoPaciente from '../../../components/modals/ModalNovoPaciente';


export default function PacientesScreen() {
    const router = useRouter();
    const [ativos, setAtivos] = useState<PacienteResponse[]>([]);
    const [pendentes, setPendentes] = useState<PacienteResponse[]>([]);

    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // UI State
    const [activeTab, setActiveTab] = useState<'ativos' | 'espera'>('ativos');

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [novoPacienteVisible, setNovoPacienteVisible] = useState(false);
    const [selectedPaciente, setSelectedPaciente] = useState<PacienteResponse | null>(null);

    const fetchPacientes = useCallback(async () => {
        try {
            const response = await api.get<PacienteResponse[]>('/pacientes/');

            // Client-side partitioning for tab control
            const activesList = response.data.filter(p => p.status === 'ativo');
            const pendingList = response.data.filter(p => p.status === 'pendente_aprovacao');

            setAtivos(activesList);
            setPendentes(pendingList);
        } catch (err: any) {
            console.log('Error fetching pacientes:', err.message);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        fetchPacientes().finally(() => setLoading(false));
    }, [fetchPacientes]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchPacientes().finally(() => setRefreshing(false));
    }, [fetchPacientes]);

    const handlePatientPress = (paciente: PacienteResponse) => {
        if (paciente.status === 'pendente_aprovacao') {
            setSelectedPaciente(paciente);
            setModalVisible(true);
        } else {
            router.push(`/pacientes/${paciente.id}`);
        }
    };

    const handleApprovalSuccess = (updatedPaciente: PacienteResponse) => {
        // Optimistic UI update: Remove from pendentes, add to ativos
        setPendentes(prev => prev.filter(p => p.id !== updatedPaciente.id));
        setAtivos(prev => [updatedPaciente, ...prev]);

        Alert.alert(
            "Triagem Aprovada",
            `${updatedPaciente.nome_completo} agora é um paciente ativo!`
        );
    };

    const handleNewPatientSuccess = (novo: PacienteResponse) => {
        setAtivos(prev => [novo, ...prev]);
        Alert.alert(
            "Paciente Cadastrado",
            "O ambiente dele está pronto e vazio. Pode começar a inserir sessões!"
        );
    };

    const renderEmptyState = () => (
        <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nenhum paciente encontrado aqui.</Text>
            {activeTab === 'ativos' && <Text style={styles.emptySubtext}>Envie seu link de triagem para iniciar!</Text>}
        </View>
    );

    const dataToShow = activeTab === 'ativos' ? ativos : pendentes;

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <View style={styles.header}>
                <Text style={styles.title}>Pacientes</Text>

                <TouchableOpacity style={styles.addBtn} onPress={() => setNovoPacienteVisible(true)}>
                    <Plus color="#FFFFFF" size={16} style={{ marginRight: 4 }} />
                    <Text style={styles.addBtnText}>Novo</Text>
                </TouchableOpacity>
            </View>

            {/* Segmented Control */}
            <View style={styles.segmentContainer}>
                <TouchableOpacity
                    style={[styles.segmentTab, activeTab === 'ativos' && styles.segmentTabActive]}
                    onPress={() => setActiveTab('ativos')}
                >
                    <Text style={[styles.segmentText, activeTab === 'ativos' && styles.segmentTextActive]}>
                        Ativos ({ativos.length})
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.segmentTab, activeTab === 'espera' && styles.segmentTabActive]}
                    onPress={() => setActiveTab('espera')}
                >
                    <Text style={[styles.segmentText, activeTab === 'espera' && styles.segmentTextActive]}>
                        Fila de Espera {pendentes.length > 0 ? `(${pendentes.length})` : ''}
                    </Text>
                    {pendentes.length > 0 && activeTab !== 'espera' && (
                        <View style={styles.badgeDot} />
                    )}
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                {loading ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color="#2C3E50" />
                    </View>
                ) : (
                    <FlatList
                        data={dataToShow}
                        keyExtractor={item => item.id.toString()}
                        renderItem={({ item }) => (
                            <PacienteCard
                                data={item}
                                onPress={handlePatientPress}
                            />
                        )}
                        contentContainerStyle={styles.listContainer}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={renderEmptyState}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A0AAB5" />
                        }
                    />
                )}
            </View>

            <ModalAprovacaoPaciente
                visible={modalVisible}
                paciente={selectedPaciente}
                onClose={() => setModalVisible(false)}
                onSuccess={handleApprovalSuccess}
            />

            <ModalNovoPaciente
                visible={novoPacienteVisible}
                onClose={() => setNovoPacienteVisible(false)}
                onSuccess={handleNewPatientSuccess}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAF9F6',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        height: 80,
    },
    title: {
        fontFamily: 'Cori-Bold',
        fontSize: 32,
        color: '#2C3E50',
        letterSpacing: -0.5,
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2C3E50',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        shadowColor: '#2C3E50',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    addBtnText: {
        fontFamily: 'Cori-Bold',
        fontSize: 14,
        color: '#FFFFFF',
    },
    segmentContainer: {
        flexDirection: 'row',
        marginHorizontal: 24,
        backgroundColor: '#EAECEE',
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
    },
    segmentTab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        flexDirection: 'row',
    },
    segmentTabActive: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    segmentText: {
        fontFamily: 'Cori-Medium',
        fontSize: 14,
        color: '#7F8C8D',
    },
    segmentTextActive: {
        fontFamily: 'Cori-Bold',
        color: '#2C3E50',
    },
    badgeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#E74C3C',
        position: 'absolute',
        top: 6,
        right: 12,
    },
    content: {
        flex: 1,
    },
    listContainer: {
        padding: 24,
        paddingBottom: 48,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 64,
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
    }
});
