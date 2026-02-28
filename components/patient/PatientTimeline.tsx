import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AgendaEvento, CheckInResponse, SessaoResponse, TarefaResponse } from '../../types/api';
import CheckinCard from '../cards/CheckinCard';
import SessaoCard from '../cards/SessaoCard';
import TarefaCard from '../cards/TarefaCard';

interface Props {
    eventos: AgendaEvento[];
    onSessaoPress: (sessao: SessaoResponse) => void;
}

function TimelineNode({
    item,
    isLast,
    onSessaoPress,
}: {
    item: AgendaEvento;
    isLast: boolean;
    onSessaoPress: (s: SessaoResponse) => void;
}) {
    let Card: React.ReactNode = null;

    switch (item.tipo_evento) {
        case 'sessao':
            Card = (
                <SessaoCard
                    data={item.dados_especificos as SessaoResponse}
                    hidePatientInfo
                    onPress={onSessaoPress}
                />
            );
            break;
        case 'tarefa':
            Card = <TarefaCard data={item.dados_especificos as TarefaResponse} hidePatientInfo />;
            break;
        case 'checkin':
            Card = <CheckinCard data={item.dados_especificos as CheckInResponse} hidePatientInfo />;
            break;
        default:
            return null;
    }

    return (
        <View style={styles.node}>
            <View style={styles.markerCol}>
                <View style={styles.dot} />
                {!isLast && <View style={styles.line} />}
            </View>
            <View style={styles.contentCol}>
                <Text style={styles.dateLabel}>
                    {format(new Date(item.data_hora), "dd 'de' MMMM", { locale: ptBR })}
                </Text>
                {Card}
            </View>
        </View>
    );
}

export default function PatientTimeline({ eventos, onSessaoPress }: Props) {
    if (eventos.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Nenhum evento recente.</Text>
                <Text style={styles.emptySubtext}>A linha do tempo deste paciente está vazia.</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {eventos.map((item, index) => (
                <TimelineNode
                    key={`${item.tipo_evento}-${item.dados_especificos.id ?? index}`}
                    item={item}
                    isLast={index === eventos.length - 1}
                    onSessaoPress={onSessaoPress}
                />
            ))}
            <View style={{ height: 40 }} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 24,
    },
    node: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    markerCol: {
        width: 24,
        alignItems: 'center',
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#2C3E50',
        marginTop: 4,
    },
    line: {
        flex: 1,
        width: 2,
        backgroundColor: '#EDF2F7',
        marginTop: 4,
        marginBottom: 4,
    },
    contentCol: {
        flex: 1,
        paddingLeft: 12,
        paddingBottom: 16,
    },
    dateLabel: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 12,
        color: '#A0AAB5',
        textTransform: 'capitalize',
        marginBottom: 8,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 48,
        paddingHorizontal: 24,
    },
    emptyText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 16,
        color: '#34495E',
        marginBottom: 8,
    },
    emptySubtext: {
        fontFamily: 'Cori-Medium',
        fontSize: 14,
        color: '#A0AAB5',
        textAlign: 'center',
    },
});
