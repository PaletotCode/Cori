import { Check, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { PacienteResponse } from '../../types/api';

interface Props {
    visible: boolean;
    paciente: PacienteResponse | null;
    onClose: () => void;
    onSuccess: (paciente: PacienteResponse) => void;
}

export default function ModalAprovacaoPaciente({ visible, paciente, onClose, onSuccess }: Props) {
    const [valorSessao, setValorSessao] = useState('');
    const [horario, setHorario] = useState('');
    const [diaVencimento, setDiaVencimento] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset states when opening for a different patient
    React.useEffect(() => {
        if (visible && paciente) {
            setValorSessao(paciente.valor_sessao || '');
            setHorario(paciente.horario_atendimento_padrao || '');
            setDiaVencimento(paciente.dia_vencimento_pagamento?.toString() || '');
            setError(null);
        }
    }, [visible, paciente]);

    const handleApprove = async () => {
        if (!paciente) return;

        setLoading(true);
        setError(null);

        try {
            const payload: any = {};
            if (valorSessao) payload.valor_sessao = valorSessao;
            if (horario) payload.horario_atendimento_padrao = horario;
            if (diaVencimento) payload.dia_vencimento_pagamento = parseInt(diaVencimento, 10);

            const response = await api.patch<PacienteResponse>(`/pacientes/${paciente.id}/aprovar`, payload);

            onSuccess(response.data);
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Erro ao aprovar o paciente. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    if (!paciente) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.overlay}
            >
                <View style={styles.sheetContainer}>
                    <View style={styles.dragHandle} />

                    <View style={styles.header}>
                        <Text style={styles.title}>Aprovar Triagem</Text>
                        <TouchableOpacity hitSlop={20} onPress={onClose} style={styles.closeBtn}>
                            <X color="#7F8C8D" size={24} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

                        <View style={styles.infoBox}>
                            <Text style={styles.infoLabel}>Paciente</Text>
                            <Text style={styles.infoValue}>{paciente.nome_completo}</Text>

                            <Text style={[styles.infoLabel, { marginTop: 12 }]}>Queixa Principal (Triagem)</Text>
                            <Text style={styles.infoValueP}>"{paciente.descricao_clinica || 'Não preenchida.'}"</Text>
                        </View>

                        <View style={styles.formContainer}>
                            <Text style={styles.sectionTitle}>Definições do Tratamento</Text>
                            <Text style={styles.sectionSubtitle}>Estabeleça os termos fixos para o início das sessões.</Text>

                            {error && (
                                <View style={styles.errorBox}>
                                    <Text style={styles.errorText}>{error}</Text>
                                </View>
                            )}

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Valor da Sessão (R$)</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Ex: 150.00"
                                    placeholderTextColor="#A0AAB5"
                                    keyboardType="numeric"
                                    value={valorSessao}
                                    onChangeText={setValorSessao}
                                    editable={!loading}
                                />
                            </View>

                            <View style={styles.rowInputs}>
                                <View style={[styles.inputGroup, { flex: 1, marginRight: 12 }]}>
                                    <Text style={styles.inputLabel}>Horário Padrão</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Ex: Terças 14h"
                                        placeholderTextColor="#A0AAB5"
                                        value={horario}
                                        onChangeText={setHorario}
                                        editable={!loading}
                                    />
                                </View>

                                <View style={[styles.inputGroup, { width: 100 }]}>
                                    <Text style={styles.inputLabel}>Vencimento</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Dia"
                                        placeholderTextColor="#A0AAB5"
                                        keyboardType="number-pad"
                                        maxLength={2}
                                        value={diaVencimento}
                                        onChangeText={setDiaVencimento}
                                        editable={!loading}
                                    />
                                </View>
                            </View>
                        </View>

                    </ScrollView>

                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[styles.primaryBtn, loading && styles.btnDisabled]}
                            onPress={handleApprove}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <>
                                    <Check color="#FFF" size={20} style={{ marginRight: 8 }} />
                                    <Text style={styles.primaryBtnText}>Aprovar e Ativar Paciente</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>

                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheetContainer: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '90%',
        paddingBottom: 32, // safe area padding essentially
    },
    dragHandle: {
        width: 40,
        height: 4,
        backgroundColor: '#E0E0E0',
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 12,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    title: {
        fontFamily: 'Cori-Bold',
        fontSize: 20,
        color: '#2C3E50',
    },
    closeBtn: {
        padding: 4,
    },
    scroll: {
        padding: 24,
    },
    infoBox: {
        backgroundColor: '#F8F9F9',
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
    },
    infoLabel: {
        fontFamily: 'Cori-Medium',
        fontSize: 12,
        color: '#7F8C8D',
        textTransform: 'uppercase',
    },
    infoValue: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 18,
        color: '#2C3E50',
        marginTop: 4,
    },
    infoValueP: {
        fontFamily: 'Cori',
        fontSize: 14,
        color: '#34495E',
        marginTop: 4,
        fontStyle: 'italic',
    },
    formContainer: {

    },
    sectionTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#2C3E50',
    },
    sectionSubtitle: {
        fontFamily: 'Cori',
        fontSize: 14,
        color: '#A0AAB5',
        marginBottom: 20,
    },
    errorBox: {
        backgroundColor: '#FDEDEC',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
    },
    errorText: {
        fontFamily: 'Cori',
        fontSize: 13,
        color: '#E74C3C',
    },
    inputGroup: {
        marginBottom: 16,
    },
    rowInputs: {
        flexDirection: 'row',
    },
    inputLabel: {
        fontFamily: 'Cori-Medium',
        fontSize: 13,
        color: '#34495E',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#EFEFEF',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontFamily: 'Cori',
        fontSize: 16,
        color: '#2C3E50',
    },
    footer: {
        paddingHorizontal: 24,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
    },
    primaryBtn: {
        backgroundColor: '#27AE60',
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 54,
    },
    btnDisabled: {
        backgroundColor: '#95A5A6',
        opacity: 0.8,
    },
    primaryBtnText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#FFFFFF',
    }
});
