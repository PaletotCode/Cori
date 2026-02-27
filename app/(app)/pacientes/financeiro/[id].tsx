import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, FilePlus } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../../../services/api';
import { FaturaResponse } from '../../../../types/api';

import FaturaCard from '../../../../components/cards/FaturaCard';
import ModalGerarFatura from '../../../../components/modals/ModalGerarFatura';

export default function PacienteFinanceiroScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();

    const [faturas, setFaturas] = useState<FaturaResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [gerarModalVisible, setGerarModalVisible] = useState(false);

    const fetchFaturas = useCallback(async () => {
        if (!id) return;
        try {
            const res = await api.get<FaturaResponse[]>(`/faturas/paciente/${id}`);
            // Ordenar da mais recente para a mais antiga por data de vencimento/referência
            const sorted = res.data.sort((a, b) => new Date(b.data_vencimento).getTime() - new Date(a.data_vencimento).getTime());
            setFaturas(sorted);
        } catch (error) {
            console.error("Error fetching faturas:", error);
        }
    }, [id]);

    useEffect(() => {
        fetchFaturas().finally(() => setLoading(false));
    }, [fetchFaturas]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchFaturas().finally(() => setRefreshing(false));
    }, [fetchFaturas]);

    const handlePayFatura = async (faturaId: number) => {
        await api.patch(`/faturas/${faturaId}/pagar`, {
            data_pagamento: new Date().toISOString().split('T')[0]
        });
        await fetchFaturas(); // reload list
    };

    const renderEmptyState = () => (
        <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Sem faturas registradas</Text>
            <Text style={styles.emptySubtext}>Nenhum fecho de mês foi realizado para este paciente.</Text>
        </View>
    );

    const renderHeader = () => (
        <View style={styles.headerContainer}>
            {/* Top Navbar */}
            <View style={styles.navBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft color="#2C3E50" size={24} />
                </TouchableOpacity>
                <Text style={styles.navTitle}>Extrato Financeiro</Text>
                <View style={{ width: 24 }} />
            </View>

            <TouchableOpacity
                style={styles.gerarBtn}
                onPress={() => setGerarModalVisible(true)}
            >
                <FilePlus color="#FFFFFF" size={20} style={{ marginRight: 8 }} />
                <Text style={styles.gerarBtnText}>Gerar Fatura do Mês</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#2C3E50" />
                </View>
            ) : (
                <FlatList
                    data={faturas}
                    keyExtractor={(item) => String(item.id)}
                    ListHeaderComponent={renderHeader}
                    renderItem={({ item }) => (
                        <View style={{ paddingHorizontal: 24 }}>
                            <FaturaCard data={item} onPay={handlePayFatura} />
                        </View>
                    )}
                    ListEmptyComponent={renderEmptyState}
                    contentContainerStyle={styles.listContainer}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2C3E50" />
                    }
                />
            )}

            <ModalGerarFatura
                visible={gerarModalVisible}
                pacienteId={Number(id)}
                onClose={() => setGerarModalVisible(false)}
                onSuccess={fetchFaturas}
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
    navTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#2C3E50',
    },
    gerarBtn: {
        flexDirection: 'row',
        backgroundColor: '#2C3E50',
        paddingVertical: 16,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#2C3E50',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    gerarBtnText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#FFFFFF',
    },
    listContainer: {
        paddingBottom: 48,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 64,
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
        textAlign: 'center',
    }
});
