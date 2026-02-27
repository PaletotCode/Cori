import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, BookOpen, Calendar } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../../services/api';

// Interface that matches the GET /anotacoes/paciente/{id} response
interface AnotacaoSessao {
    id: number;
    sessao_id: number;
    texto_anotacao: string;
    data_criacao: string;
    data_atualizacao: string | null;
    sessao: {
        id: number;
        data_hora: string;
    };
}

export default function HistoriAnotacoesScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();

    const [anotacoes, setAnotacoes] = useState<AnotacaoSessao[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchAnotacoes = useCallback(async () => {
        if (!id) return;
        try {
            const res = await api.get<AnotacaoSessao[]>(`/anotacoes/paciente/${id}`);

            // Sort by data_hora desc
            const sorted = res.data.sort((a, b) => {
                return new Date(b.sessao.data_hora).getTime() - new Date(a.sessao.data_hora).getTime();
            });

            setAnotacoes(sorted);
        } catch (err) {
            console.error('Falha ao buscar anotações', err);
            setError('Não foi possível carregar o histórico de prontuários.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchAnotacoes();
    }, [fetchAnotacoes]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchAnotacoes().finally(() => setRefreshing(false));
    }, [fetchAnotacoes]);

    const renderAnotacao = ({ item }: { item: AnotacaoSessao }) => {
        const dataSessao = parseISO(item.sessao.data_hora);

        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={styles.dateBadge}>
                        <Calendar color="#34495E" size={16} />
                        <Text style={styles.dateText}>
                            {format(dataSessao, "dd 'de' MMMM, yyyy", { locale: ptBR })}
                        </Text>
                    </View>
                    <Text style={styles.horaText}>
                        {format(dataSessao, "HH:mm")}
                    </Text>
                </View>

                <View style={styles.cardBody}>
                    <Text style={styles.textoAnotacao}>{item.texto_anotacao}</Text>
                </View>

                {item.data_atualizacao && (
                    <Text style={styles.updatedText}>
                        Editado em {format(parseISO(item.data_atualizacao), "dd/MM/yyyy 'às' HH:mm")}
                    </Text>
                )}
            </View>
        );
    };

    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBg}>
                <BookOpen color="#A0AAB5" size={32} />
            </View>
            <Text style={styles.emptyTitle}>Nenhum prontuário</Text>
            <Text style={styles.emptySubtitle}>Este paciente ainda não possui anotações clínicas registradas após as consultas.</Text>
        </View>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft color="#2C3E50" size={24} />
                </TouchableOpacity>
                <View style={styles.headerTitles}>
                    <Text style={styles.headerTitle}>Anotações Clínicas</Text>
                    <Text style={styles.headerSubtitle}>Histórico Completo</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#2C3E50" />
                </View>
            ) : error ? (
                <View style={styles.centerContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            ) : (
                <FlatList
                    data={anotacoes}
                    keyExtractor={item => String(item.id)}
                    renderItem={renderAnotacao}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={renderEmpty}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2C3E50" />
                    }
                />
            )}
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
        paddingTop: 16,
        paddingBottom: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
        backgroundColor: '#FFFFFF',
    },
    backBtn: {
        padding: 8,
        marginLeft: -8,
        width: 40,
    },
    headerTitles: {
        alignItems: 'center',
    },
    headerTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#2C3E50',
    },
    headerSubtitle: {
        fontFamily: 'Cori-Medium',
        fontSize: 14,
        color: '#7F8C8D',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    errorText: {
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#E74C3C',
        textAlign: 'center',
    },
    listContent: {
        padding: 24,
        paddingBottom: 48,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#EFEFEF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F9FBF9',
    },
    dateBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F4F6F8',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    dateText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 13,
        color: '#34495E',
        marginLeft: 8,
    },
    horaText: {
        fontFamily: 'Cori-Bold',
        fontSize: 14,
        color: '#A0AAB5',
    },
    cardBody: {
        marginBottom: 8,
    },
    textoAnotacao: {
        fontFamily: 'Cori',
        fontSize: 16,
        color: '#2C3E50',
        lineHeight: 24,
    },
    updatedText: {
        fontFamily: 'Cori',
        fontSize: 12,
        color: '#BDC3C7',
        marginTop: 12,
        textAlign: 'right',
        fontStyle: 'italic',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
        paddingHorizontal: 24,
    },
    emptyIconBg: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#F4F6F8',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    emptyTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 20,
        color: '#34495E',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontFamily: 'Cori',
        fontSize: 15,
        color: '#7F8C8D',
        textAlign: 'center',
        lineHeight: 22,
    }
});
