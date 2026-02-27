import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, Circle, Tag } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TarefaResponse } from '../../types/api';

interface Props {
    data: TarefaResponse;
    hidePatientInfo?: boolean;
}

export default function TarefaCard({ data, hidePatientInfo }: Props) {
    const isCompleted = data.status === 'concluida';

    const formatDate = (isoString?: string) => {
        if (!isoString) return 'Sem Prazo';
        try {
            const date = parseISO(isoString);
            return format(date, "dd MMM 'às' HH:mm", { locale: ptBR });
        } catch (e) {
            return '';
        }
    };

    return (
        <View style={[styles.card, isCompleted && styles.cardCompleted]}>
            <View style={styles.iconColumn}>
                {isCompleted ? (
                    <CheckCircle2 color="#27AE60" size={24} strokeWidth={2.5} />
                ) : (
                    <Circle color="#A0AAB5" size={24} strokeWidth={2} />
                )}
            </View>

            <View style={styles.contentColumn}>
                <View style={styles.header}>
                    <View style={styles.badge}>
                        <Tag color="#7F8C8D" size={10} />
                        <Text style={styles.badgeText}>Para Casa</Text>
                    </View>
                    <Text style={styles.deadline}>{formatDate(data.data_vencimento)}</Text>
                </View>

                <Text style={[styles.title, isCompleted && styles.textCompleted]}>
                    {data.titulo}
                </Text>

                {!hidePatientInfo && (
                    <Text style={[styles.patientName, isCompleted && styles.textCompletedLight]}>
                        Paciente: {data.paciente?.nome_completo || 'Desconhecido'}
                    </Text>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F0F0F0',
        borderLeftWidth: 4,
        borderLeftColor: '#F39C12', // Orange marker for Tasks
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1,
    },
    cardCompleted: {
        opacity: 0.7,
        borderLeftColor: '#27AE60',
        backgroundColor: '#F9FBF9',
    },
    iconColumn: {
        width: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    contentColumn: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F2F4F4',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    badgeText: {
        fontFamily: 'Cori-Medium',
        fontSize: 10,
        color: '#7F8C8D',
        marginLeft: 4,
    },
    deadline: {
        fontFamily: 'Cori',
        fontSize: 12,
        color: '#E74C3C', // Red for deadline
        fontWeight: '500',
    },
    title: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#2C3E50',
        marginBottom: 4,
    },
    patientName: {
        fontFamily: 'Cori',
        fontSize: 13,
        color: '#7F8C8D',
    },
    textCompleted: {
        textDecorationLine: 'line-through',
        color: '#95A5A6',
    },
    textCompletedLight: {
        color: '#BDC3C7',
    }
});
