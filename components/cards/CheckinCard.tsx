import { Heart } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CheckInResponse } from '../../types/api';

interface Props {
    data: CheckInResponse;
    hidePatientInfo?: boolean;
}

export default function CheckinCard({ data, hidePatientInfo }: Props) {

    const getMoodEmoji = (level: number) => {
        switch (level) {
            case 5: return '😄'; // Excelente
            case 4: return '🙂'; // Bom
            case 3: return '😐'; // Neutro
            case 2: return '🙁'; // Ruim
            case 1: return '😫'; // Muito Ruim
            default: return '😐';
        }
    };

    const getAnxietyColor = (level: number) => {
        if (level <= 3) return '#27AE60'; // Low - Green
        if (level <= 6) return '#F39C12'; // Med - Orange
        return '#E74C3C'; // High - Red
    };

    const renderAnxietyBars = (level: number) => {
        // 5 bars represents 10 levels (2 levels per bar)
        const blocks = Math.ceil(level / 2);
        const color = getAnxietyColor(level);

        return (
            <View style={styles.barsContainer}>
                {[1, 2, 3, 4, 5].map(bar => (
                    <View
                        key={bar}
                        style={[
                            styles.bar,
                            { backgroundColor: bar <= blocks ? color : '#E5E7EB' },
                            bar <= blocks && { height: 12 + (bar * 2) } // Rising effect
                        ]}
                    />
                ))}
            </View>
        );
    };

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                {!hidePatientInfo ? (
                    <View style={styles.patientBadge}>
                        <Heart color="#9B59B6" size={14} />
                        <Text style={styles.patientName}>{data.paciente?.nome_completo || 'Paciente'}</Text>
                    </View>
                ) : (
                    <View /> // keeps flex space-between intact
                )}
                <Text style={styles.timeText}>Check-in de Humor</Text>
            </View>

            <View style={styles.metricsRow}>
                <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>Humor</Text>
                    <View style={styles.moodBox}>
                        <Text style={styles.emoji}>{getMoodEmoji(data.nivel_humor)}</Text>
                    </View>
                </View>

                <View style={styles.metricDivider} />

                <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>Ansiedade (Nível {data.nivel_ansiedade})</Text>
                    <View style={styles.anxietyBox}>
                        {renderAnxietyBars(data.nivel_ansiedade)}
                    </View>
                </View>
            </View>

            {!!data.anotacao_paciente && (
                <View style={styles.noteBox}>
                    <Text style={styles.noteText} numberOfLines={2}>"{data.anotacao_paciente}"</Text>
                </View>
            )}
        </View>
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
        borderLeftWidth: 4,
        borderLeftColor: '#9B59B6', // Purple marker for Checkins
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    patientBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5EEF8', // Light purple
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    patientName: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 12,
        color: '#8E44AD',
        marginLeft: 6,
    },
    timeText: {
        fontFamily: 'Cori-Medium',
        fontSize: 12,
        color: '#A0AAB5',
    },
    metricsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        marginBottom: 12,
    },
    metricBlock: {
        alignItems: 'center',
        flex: 1,
    },
    metricLabel: {
        fontFamily: 'Cori',
        fontSize: 12,
        color: '#7F8C8D',
        marginBottom: 8,
    },
    moodBox: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#F9FBF9',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#EFEFEF',
    },
    emoji: {
        fontSize: 24,
    },
    anxietyBox: {
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    barsContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: 24,
    },
    bar: {
        width: 6,
        height: 12,
        backgroundColor: '#E5E7EB',
        borderRadius: 4,
        marginHorizontal: 2,
    },
    metricDivider: {
        width: 1,
        height: 40,
        backgroundColor: '#F0F0F0',
    },
    noteBox: {
        backgroundColor: '#F8F9F9',
        padding: 12,
        borderRadius: 8,
        marginTop: 4,
    },
    noteText: {
        fontFamily: 'Cori',
        fontSize: 13,
        color: '#555',
        fontStyle: 'italic',
    }
});
