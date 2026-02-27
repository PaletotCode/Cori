import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CheckCircle2, Clock, DollarSign, XCircle } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FaturaResponse } from '../../types/api';

interface Props {
    data: FaturaResponse;
    onPay: (faturaId: number) => Promise<void>;
}

export default function FaturaCard({ data, onPay }: Props) {
    const [isPaying, setIsPaying] = useState(false);

    const getStatusConfig = (estado: string) => {
        switch (estado) {
            case 'paga':
                return { label: 'Paga', color: '#27AE60', bg: '#E8F5E9', icon: CheckCircle2 }; // Green
            case 'atrasada':
                return { label: 'Atrasada', color: '#E74C3C', bg: '#FDECEA', icon: AlertTriangle }; // Red
            case 'pendente':
                return { label: 'Pendente', color: '#F39C12', bg: '#FEF5E7', icon: Clock }; // Orange
            case 'cancelada':
                return { label: 'Cancelada', color: '#7F8C8D', bg: '#F2F4F4', icon: XCircle }; // Grey
            default:
                return { label: 'Desconhecido', color: '#34495E', bg: '#ECF0F1', icon: Clock };
        }
    };

    const config = getStatusConfig(data.estado);
    const StatusIcon = config.icon;

    // Build the "Outubro 2026" text. JS dates are 0-indexed for month so we use mes - 1.
    const referenceDate = new Date(data.ano_referencia, data.mes_referencia - 1, 1);
    const monthName = format(referenceDate, 'MMMM', { locale: ptBR });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const formatBRL = (value: number | string) => {
        const num = typeof value === 'string' ? parseFloat(value) : value;
        return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const handlePayClick = async () => {
        setIsPaying(true);
        try {
            await onPay(data.id);
        } finally {
            setIsPaying(false);
        }
    };

    const isPayable = data.estado === 'pendente' || data.estado === 'atrasada';

    return (
        <View style={[styles.card, { borderLeftColor: config.color }]}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Text style={styles.referenceText}>{capitalizedMonth} {data.ano_referencia}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
                        <StatusIcon color={config.color} size={14} style={{ marginRight: 4 }} />
                        <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
                    </View>
                </View>
                <Text style={styles.amountText}>{formatBRL(data.valor_total)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.footer}>
                <View style={styles.detailsCol}>
                    <Text style={styles.detailLabel}>Vencimento</Text>
                    <Text style={[styles.detailValue, data.estado === 'atrasada' && styles.detailValueDanger]}>
                        {format(parseISO(data.data_vencimento), 'dd/MM/yyyy')}
                    </Text>
                </View>

                <View style={styles.detailsCol}>
                    <Text style={styles.detailLabel}>Sessões Inclusas</Text>
                    <Text style={styles.detailValue}>{data.total_sessoes}</Text>
                </View>

                {data.data_pagamento && (
                    <View style={styles.detailsCol}>
                        <Text style={styles.detailLabel}>Paga em</Text>
                        <Text style={styles.detailValue}>
                            {format(parseISO(data.data_pagamento), 'dd/MM/yyyy')}
                        </Text>
                    </View>
                )}
            </View>

            {isPayable && (
                <View style={styles.actionArea}>
                    <TouchableOpacity
                        style={styles.payBtn}
                        onPress={handlePayClick}
                        disabled={isPaying}
                    >
                        {isPaying ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                            <>
                                <DollarSign color="#FFFFFF" size={18} style={{ marginRight: 6 }} />
                                <Text style={styles.payBtnText}>Registrar Pagamento</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#F0F0F0',
        borderLeftWidth: 4,
    },
    header: {
        marginBottom: 16,
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    referenceText: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#2C3E50',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 12,
        textTransform: 'uppercase',
    },
    amountText: {
        fontFamily: 'SpaceMono',
        fontSize: 28,
        color: '#2C3E50',
        fontWeight: '700',
        letterSpacing: -1,
    },
    divider: {
        height: 1,
        backgroundColor: '#F0F0F0',
        marginBottom: 16,
    },
    footer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    detailsCol: {
        marginBottom: 8,
        marginRight: 16,
        minWidth: 80,
    },
    detailLabel: {
        fontFamily: 'Cori-Medium',
        fontSize: 12,
        color: '#A0AAB5',
        marginBottom: 2,
    },
    detailValue: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 14,
        color: '#34495E',
    },
    detailValueDanger: {
        color: '#E74C3C',
    },
    actionArea: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
    },
    payBtn: {
        flexDirection: 'row',
        backgroundColor: '#2C3E50',
        paddingVertical: 14,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    payBtnText: {
        fontFamily: 'Cori-Bold',
        fontSize: 15,
        color: '#FFFFFF',
    }
});
