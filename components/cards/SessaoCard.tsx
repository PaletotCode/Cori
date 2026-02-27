import { format, parseISO } from 'date-fns';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SessaoResponse } from '../../types/api';

interface Props {
    data: SessaoResponse;
    hidePatientInfo?: boolean;
    onPress?: (sessao: SessaoResponse) => void;
}

export default function SessaoCard({ data, hidePatientInfo, onPress }: Props) {
    const getStatusColor = (estado: string) => {
        switch (estado) {
            case 'realizada': return '#27AE60'; // Green
            case 'confirmada': return '#2980B9'; // Blue
            case 'cancelada_paciente': return '#E74C3C'; // Red
            case 'falta_cobrada': return '#E67E22'; // Orange
            case 'remarcada': return '#95A5A6'; // Grey
            case 'agendada':
            default:
                return '#34495E'; // Dark Slate
        }
    };

    const statusMap: Record<string, string> = {
        'agendada': 'Agendada',
        'confirmada': 'Confirmada',
        'realizada': 'Realizada',
        'falta_cobrada': 'Falta (Cobrada)',
        'cancelada_paciente': 'Cancelada',
        'remarcada': 'Remarcada',
    };

    const formatTime = (isoString: string) => {
        try {
            return format(parseISO(isoString), 'HH:mm');
        } catch (e) {
            return '--:--';
        }
    };

    const getInitials = (name?: string) => {
        if (!name) return '??';
        const split = name.split(' ');
        if (split.length > 1) {
            return `${split[0][0]}${split[split.length - 1][0]}`.toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    return (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={onPress ? 0.7 : 1}
            onPress={() => onPress && onPress(data)}
        >
            <View style={styles.timeColumn}>
                <Text style={styles.timeText}>{formatTime(data.data_hora_inicio)}</Text>
                <Text style={styles.timeDuration}>1h</Text>
            </View>

            <View style={styles.contentColumn}>
                {!hidePatientInfo && (
                    <View style={styles.patientRow}>
                        {data.paciente?.foto_perfil_url ? (
                            <Image source={{ uri: data.paciente.foto_perfil_url }} style={styles.avatar} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Text style={styles.avatarText}>{getInitials(data.paciente?.nome_completo)}</Text>
                            </View>
                        )}
                        <Text style={styles.patientName}>{data.paciente?.nome_completo || 'Paciente Desconhecido'}</Text>
                    </View>
                )}


                <View style={styles.statusRow}>
                    <View style={[styles.statusBadge, { borderColor: getStatusColor(data.estado) }]}>
                        <View style={[styles.statusDot, { backgroundColor: getStatusColor(data.estado) }]} />
                        <Text style={[styles.statusText, { color: getStatusColor(data.estado) }]}>
                            {statusMap[data.estado] || 'Agendada'}
                        </Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#F0F0F0',
    },
    timeColumn: {
        width: 60,
        alignItems: 'center',
        justifyContent: 'center',
        borderRightWidth: 1,
        borderRightColor: '#F0F0F0',
        paddingRight: 12,
    },
    timeText: {
        fontFamily: 'SpaceMono',
        fontSize: 16,
        color: '#2C3E50',
        fontWeight: '600',
    },
    timeDuration: {
        fontFamily: 'Cori',
        fontSize: 12,
        color: '#A0AAB5',
        marginTop: 4,
    },
    contentColumn: {
        flex: 1,
        paddingLeft: 16,
        justifyContent: 'center',
    },
    patientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        marginRight: 10,
    },
    avatarPlaceholder: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#EDF2F7',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    avatarText: {
        fontFamily: 'Cori-Bold',
        fontSize: 12,
        color: '#34495E',
    },
    patientName: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 16,
        color: '#2C3E50',
    },
    statusRow: {
        flexDirection: 'row',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 6,
    },
    statusText: {
        fontFamily: 'Cori-Medium',
        fontSize: 11,
        textTransform: 'uppercase',
    }
});
