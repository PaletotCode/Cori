import { Activity, FileText, MessageCircle } from 'lucide-react-native';
import React from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PacienteResponse } from '../../types/api';

interface Props {
    data: PacienteResponse;
    onPress?: (paciente: PacienteResponse) => void;
}

export default function PacienteCard({ data, onPress }: Props) {

    const getInitials = (name: string) => {
        if (!name) return '??';
        const parts = name.trim().split(' ');
        if (parts.length > 1) {
            return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ativo': return '#27AE60'; // Green
            case 'pendente_aprovacao': return '#F39C12'; // Orange
            case 'inativo': return '#95A5A6'; // Grey
            case 'alta': return '#3498DB'; // Blue
            case 'pausado': return '#E67E22'; // Dark Orange
            default: return '#7F8C8D';
        }
    };

    const statusLabels: Record<string, string> = {
        'ativo': 'Ativo',
        'pendente_aprovacao': 'Aguardando',
        'inativo': 'Inativo',
        'alta': 'Em Alta',
        'pausado': 'Pausado'
    };

    const handleWhatsApp = () => {
        if (data.meios_comunicacao?.whatsapp) {
            // Clean up string to have only digits
            const phone = data.meios_comunicacao.whatsapp.replace(/\D/g, '');
            Linking.openURL(`whatsapp://send?phone=${phone}`);
        }
    };

    const isPending = data.status === 'pendente_aprovacao';

    return (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={onPress ? 0.7 : 1}
            onPress={() => onPress?.(data)}
        >
            <View style={styles.contentRow}>
                {data.foto_perfil_url ? (
                    <Image source={{ uri: data.foto_perfil_url }} style={styles.avatar} />
                ) : (
                    <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>{getInitials(data.nome_completo)}</Text>
                    </View>
                )}

                <View style={styles.infoCol}>
                    <Text style={styles.nameText}>{data.nome_completo}</Text>

                    <View style={styles.badgesRow}>
                        <View style={[styles.statusBadge, { borderColor: getStatusColor(data.status) }]}>
                            <View style={[styles.statusDot, { backgroundColor: getStatusColor(data.status) }]} />
                            <Text style={[styles.statusText, { color: getStatusColor(data.status) }]}>
                                {statusLabels[data.status] || data.status}
                            </Text>
                        </View>

                        {isPending && (
                            <View style={styles.actionRequiredBadge}>
                                <Activity color="#E74C3C" size={12} />
                                <Text style={styles.actionRequiredText}>Aprovar Triagem</Text>
                            </View>
                        )}
                    </View>
                </View>

                {!isPending && data.meios_comunicacao?.whatsapp && (
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={handleWhatsApp}
                    >
                        <MessageCircle color="#27AE60" size={20} strokeWidth={2.5} />
                    </TouchableOpacity>
                )}

            </View>

            {isPending && !!data.descricao_clinica && (
                <View style={styles.triagePreview}>
                    <FileText color="#A0AAB5" size={14} style={{ marginRight: 6 }} />
                    <Text style={styles.triageText} numberOfLines={1}>
                        Queixa: {data.descricao_clinica}
                    </Text>
                </View>
            )}

        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F0F0F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
    },
    contentRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        marginRight: 14,
    },
    avatarPlaceholder: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#EDF2F7',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    avatarText: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#34495E',
    },
    infoCol: {
        flex: 1,
        justifyContent: 'center',
    },
    nameText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 16,
        color: '#2C3E50',
        marginBottom: 6,
    },
    badgesRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        marginRight: 8,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 4,
    },
    statusText: {
        fontFamily: 'Cori-Medium',
        fontSize: 10,
        textTransform: 'uppercase',
    },
    actionRequiredBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FDEDEC',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    actionRequiredText: {
        fontFamily: 'Cori-Bold',
        fontSize: 10,
        color: '#E74C3C',
        marginLeft: 4,
    },
    actionButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#EAFAF1', // Light green
        alignItems: 'center',
        justifyContent: 'center',
    },
    triagePreview: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 14,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
    },
    triageText: {
        fontFamily: 'Cori',
        fontSize: 13,
        color: '#7F8C8D',
        flex: 1,
    }
});
