import { Calendar, DollarSign, UserCheck } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { PacienteResponse } from '../../types/api';
import BottomSheetModalCustom from './BottomSheetModalCustom';

interface ModalAprovarTriagemProps {
    visible: boolean;
    onClose: () => void;
    paciente: PacienteResponse | null;
    onSuccess: () => void;
}

export default function ModalAprovarTriagem({ visible, onClose, paciente, onSuccess }: ModalAprovarTriagemProps) {
    const [valorSessao, setValorSessao] = useState('');
    const [diaVencimento, setDiaVencimento] = useState('');
    const [horario, setHorario] = useState('');
    const [loading, setLoading] = useState(false);

    // Reset state on open
    React.useEffect(() => {
        if (visible) {
            setValorSessao('');
            setDiaVencimento('');
            setHorario('');
        }
    }, [visible]);

    const handleAprovar = async () => {
        if (!paciente) return;

        if (valorSessao.trim() && isNaN(Number(valorSessao.trim()))) {
            Alert.alert("Erro", "O valor da sessão deve ser um número válido.");
            return;
        }
        if (diaVencimento.trim()) {
            const dia = Number(diaVencimento.trim());
            if (isNaN(dia) || dia < 1 || dia > 31) {
                Alert.alert("Erro", "O dia de vencimento deve estar entre 1 e 31.");
                return;
            }
        }

        setLoading(true);
        try {
            const payload = {
                valor_sessao: valorSessao ? Number(valorSessao) : undefined,
                dia_vencimento: diaVencimento ? Number(diaVencimento) : undefined,
                horario: horario || undefined
            };

            await api.patch(`/pacientes/${paciente.id}/aprovar`, payload);
            Alert.alert("Sucesso", "Paciente aprovado e ativado!");
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error(error);
            Alert.alert("Erro", "Não foi possível aprovar a triagem.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <BottomSheetModalCustom visible={visible} onClose={onClose}>
            <ScrollView style={styles.contentContainer} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <View style={styles.iconContainer}>
                        <UserCheck color="#F39C12" size={28} />
                    </View>
                    <Text style={styles.title}>Aprovar Paciente</Text>
                    <Text style={styles.subtitle}>{paciente?.nome_completo}</Text>
                    <Text style={styles.infoText}>
                        Defina os termos do acompanhamento para ativar este paciente em sua clínica.
                    </Text>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Valor da Sessão (R$)</Text>
                    <View style={styles.inputContainer}>
                        <DollarSign color="#A0AAB5" size={20} />
                        <TextInput
                            style={styles.input}
                            placeholder="Ex: 150.00"
                            value={valorSessao}
                            onChangeText={setValorSessao}
                            keyboardType="decimal-pad"
                        />
                    </View>
                </View>

                <View style={styles.row}>
                    <View style={[styles.inputGroup, { flex: 1, marginRight: 12 }]}>
                        <Text style={styles.label}>Dia de Vencimento</Text>
                        <TextInput
                            style={styles.inputStandalone}
                            placeholder="Ex: 5"
                            value={diaVencimento}
                            onChangeText={setDiaVencimento}
                            keyboardType="number-pad"
                            maxLength={2}
                        />
                    </View>

                    <View style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={styles.label}>Horário Fixo</Text>
                        <View style={styles.inputContainer}>
                            <Calendar color="#A0AAB5" size={20} />
                            <TextInput
                                style={styles.input}
                                placeholder="Seg 14h"
                                value={horario}
                                onChangeText={setHorario}
                            />
                        </View>
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.btnAprovar, loading && styles.btnDisabled]}
                    onPress={handleAprovar}
                    disabled={loading}
                >
                    <Text style={styles.btnAprovarText}>
                        {loading ? 'Aprovando...' : 'Aprovar e Ativar Paciente'}
                    </Text>
                </TouchableOpacity>

                <View style={{ height: 24 }} />
            </ScrollView>
        </BottomSheetModalCustom>
    );
}

const styles = StyleSheet.create({
    contentContainer: {
        padding: 24,
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
        marginTop: 16,
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#FEF5E7',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    title: {
        fontFamily: 'Cori-Bold',
        fontSize: 22,
        color: '#2C3E50',
        marginBottom: 4,
    },
    subtitle: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 18,
        color: '#F39C12',
        marginBottom: 8,
    },
    infoText: {
        fontFamily: 'Cori',
        fontSize: 14,
        color: '#7F8C8D',
        textAlign: 'center',
        lineHeight: 20
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 14,
        color: '#34495E',
        marginBottom: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FBF9',
        borderWidth: 1,
        borderColor: '#EFEFEF',
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 52,
    },
    inputStandalone: {
        backgroundColor: '#F9FBF9',
        borderWidth: 1,
        borderColor: '#EFEFEF',
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 52,
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#2C3E50',
    },
    input: {
        flex: 1,
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#2C3E50',
        marginLeft: 12,
    },
    btnAprovar: {
        backgroundColor: '#F39C12',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 8,
        shadowColor: '#F39C12',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    btnDisabled: {
        opacity: 0.7,
    },
    btnAprovarText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#FFFFFF',
    }
});
