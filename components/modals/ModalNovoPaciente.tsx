import { FileText, Phone, User, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { PacienteResponse } from '../../types/api';

interface Props {
    visible: boolean;
    onClose: () => void;
    onSuccess: (paciente: PacienteResponse) => void;
}

export default function ModalNovoPaciente({ visible, onClose, onSuccess }: Props) {
    const [nome, setNome] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [valor, setValor] = useState('');
    const [queixa, setQueixa] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!nome.trim()) {
            Alert.alert("Aviso", "O nome principal é obrigatório para cadastrar o paciente.");
            return;
        }

        setLoading(true);
        try {
            const payload: any = {
                nome_completo: nome.trim(),
                status: 'ativo',
            };

            if (whatsapp.trim()) {
                payload.meios_comunicacao = { whatsapp: whatsapp.trim() };
            }
            if (valor.trim()) {
                payload.valor_sessao = parseFloat(valor.replace(',', '.'));
            }
            if (queixa.trim()) {
                payload.descricao_clinica = queixa.trim();
            }

            const response = await api.post<PacienteResponse>('/pacientes/', payload);

            // Limpar formulário
            setNome('');
            setWhatsapp('');
            setValor('');
            setQueixa('');

            onSuccess(response.data);
            onClose();
        } catch (error: any) {
            console.error('Error creating patient:', error.message);
            Alert.alert("Erro", "Não foi possível cadastrar o paciente. Tente novamente.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.modalOverlay}
            >
                <View style={styles.modalContent}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Novo Paciente</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X color="#7F8C8D" size={24} />
                        </TouchableOpacity>
                    </View>

                    {/* Form */}
                    <ScrollView contentContainerStyle={styles.formContainer} showsVerticalScrollIndicator={false}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Nome completo *</Text>
                            <View style={styles.inputWrapper}>
                                <User color="#A0AAB5" size={20} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Ex: Carlos Eduardo"
                                    placeholderTextColor="#A0AAB5"
                                    value={nome}
                                    onChangeText={setNome}
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>WhatsApp</Text>
                            <View style={styles.inputWrapper}>
                                <Phone color="#A0AAB5" size={20} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="(11) 99999-9999"
                                    placeholderTextColor="#A0AAB5"
                                    keyboardType="phone-pad"
                                    value={whatsapp}
                                    onChangeText={setWhatsapp}
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Valor da Sessão (R$)</Text>
                            <View style={styles.inputWrapper}>
                                <Text style={styles.currencyPrefix}>R$</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="0,00"
                                    placeholderTextColor="#A0AAB5"
                                    keyboardType="numeric"
                                    value={valor}
                                    onChangeText={setValor}
                                />
                            </View>
                            <Text style={styles.subLabel}>Deixe em branco se ainda não definiu.</Text>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Anotações Iniciais</Text>
                            <View style={styles.inputWrapperArea}>
                                <FileText color="#A0AAB5" size={20} style={styles.inputIconArea} />
                                <TextInput
                                    style={styles.inputArea}
                                    placeholder="Motivo da busca, observações do cadastro..."
                                    placeholderTextColor="#A0AAB5"
                                    multiline
                                    numberOfLines={4}
                                    textAlignVertical="top"
                                    value={queixa}
                                    onChangeText={setQueixa}
                                />
                            </View>
                        </View>
                    </ScrollView>

                    {/* Footer Actions */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.cancelarBtn}
                            onPress={onClose}
                            disabled={loading}
                        >
                            <Text style={styles.cancelarText}>Cancelar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.salvarBtn, !nome.trim() && styles.salvarBtnDisabled]}
                            onPress={handleSubmit}
                            disabled={!nome.trim() || loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <Text style={styles.salvarText}>Cadastrar</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(44, 62, 80, 0.4)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '90%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 24,
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
    formContainer: {
        padding: 24,
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
    subLabel: {
        fontFamily: 'Cori',
        fontSize: 12,
        color: '#A0AAB5',
        marginTop: 4,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FBF9',
        borderWidth: 1,
        borderColor: '#EFEFEF',
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 52,
    },
    inputIcon: {
        marginRight: 12,
    },
    currencyPrefix: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#A0AAB5',
        marginRight: 8,
    },
    input: {
        flex: 1,
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#2C3E50',
        height: '100%',
    },
    inputWrapperArea: {
        flexDirection: 'row',
        backgroundColor: '#F9FBF9',
        borderWidth: 1,
        borderColor: '#EFEFEF',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        minHeight: 120,
    },
    inputIconArea: {
        marginRight: 12,
        marginTop: 2,
    },
    inputArea: {
        flex: 1,
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#2C3E50',
    },
    footer: {
        flexDirection: 'row',
        paddingHorizontal: 24,
        paddingVertical: 16,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
        backgroundColor: '#FFFFFF',
        paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    },
    cancelarBtn: {
        flex: 1,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        borderRadius: 12,
        backgroundColor: '#F9FBF9',
        borderWidth: 1,
        borderColor: '#EFEFEF',
    },
    cancelarText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 16,
        color: '#7F8C8D',
    },
    salvarBtn: {
        flex: 2,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: '#27AE60',
        shadowColor: '#27AE60',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    salvarBtnDisabled: {
        backgroundColor: '#A0AAB5',
        shadowOpacity: 0,
        elevation: 0,
    },
    salvarText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#FFFFFF',
    }
});
