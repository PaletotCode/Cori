import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { Calendar, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../services/api';

interface Props {
    visible: boolean;
    pacienteId: number;
    onClose: () => void;
    onSuccess: () => void;
}

export default function ModalNovaTarefa({ visible, pacienteId, onClose, onSuccess }: Props) {
    const [loading, setLoading] = useState(false);

    // Base State
    const [titulo, setTitulo] = useState('');
    const [descricao, setDescricao] = useState('');

    const [dataVencimento, setDataVencimento] = useState<Date | null>(null);
    const [showPicker, setShowPicker] = useState(false);

    const handleSubmit = async () => {
        if (!titulo.trim()) {
            Alert.alert('Atenção', 'O título da tarefa é obrigatório.');
            return;
        }

        setLoading(true);
        try {
            const payload: any = {
                paciente_id: pacienteId,
                titulo: titulo.trim(),
            };

            if (descricao.trim()) {
                payload.descricao = descricao.trim();
            }

            if (dataVencimento) {
                payload.data_vencimento = dataVencimento.toISOString();
            }

            await api.post('/tarefas/', payload);
            Alert.alert('Sucesso', 'Tarefa criada com sucesso!');
            onSuccess();
            handleClose();
        } catch (error: any) {
            Alert.alert('Erro', error.response?.data?.detail || 'Erro ao criar tarefa');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        // Reset state before close
        setTitulo('');
        setDescricao('');
        setDataVencimento(null);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={handleClose}
        >
            <SafeAreaView style={styles.modalOverlay} edges={['top', 'bottom']}>
                <View style={styles.modalContent}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Nova Tarefa</Text>
                        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                            <X color="#2C3E50" size={24} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.form}>
                        {/* Titulo */}
                        <Text style={styles.label}>Título (Obrigatório)</Text>
                        <TextInput
                            style={styles.input}
                            value={titulo}
                            onChangeText={setTitulo}
                            placeholder="Ex: Ler capítulo 1 do livro"
                            placeholderTextColor="#BDC3C7"
                        />

                        {/* Descricao */}
                        <Text style={styles.label}>Descrição (Opcional)</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            value={descricao}
                            onChangeText={setDescricao}
                            placeholder="Detalhes adicionais para o paciente..."
                            placeholderTextColor="#BDC3C7"
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                        />

                        {/* Data de Vencimento */}
                        <Text style={styles.label}>Data e Hora do Vencimento (Opcional)</Text>
                        <TouchableOpacity
                            style={styles.dateSelector}
                            onPress={() => setShowPicker(true)}
                        >
                            <Calendar color={dataVencimento ? "#2C3E50" : "#A0AAB5"} size={20} />
                            <Text style={[styles.dateText, !dataVencimento && styles.dateTextEmpty]}>
                                {dataVencimento ? format(dataVencimento, "dd/MM/yyyy 'às' HH:mm") : 'Sem prazo definido'}
                            </Text>

                            {dataVencimento && (
                                <TouchableOpacity onPress={() => setDataVencimento(null)} style={styles.clearDateBtn}>
                                    <X color="#A0AAB5" size={16} />
                                </TouchableOpacity>
                            )}
                        </TouchableOpacity>

                        {showPicker && (
                            <DateTimePicker
                                value={dataVencimento || new Date()}
                                mode="datetime"
                                display="default"
                                onChange={(event, date) => {
                                    setShowPicker(false);
                                    if (date) {
                                        setDataVencimento(date);
                                    }
                                }}
                            />
                        )}

                        <TouchableOpacity
                            style={[styles.submitBtn, (!titulo.trim() || loading) && styles.submitBtnDisabled]}
                            onPress={handleSubmit}
                            disabled={!titulo.trim() || loading}
                        >
                            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Criar Tarefa</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'flex-end', // Bottom sheet feel
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        minHeight: '60%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontFamily: 'Cori-Bold',
        fontSize: 24,
        color: '#2C3E50',
    },
    closeBtn: {
        padding: 8,
        backgroundColor: '#F9FBF9',
        borderRadius: 20,
    },
    form: {
        flex: 1,
    },
    label: {
        fontFamily: 'Cori-Medium',
        fontSize: 14,
        color: '#34495E',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#FAF9F6',
        borderWidth: 1,
        borderColor: '#EAECEE',
        borderRadius: 12,
        padding: 16,
        fontFamily: 'Cori',
        fontSize: 16,
        color: '#2C3E50',
        marginBottom: 20,
    },
    textArea: {
        height: 100,
    },
    dateSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FAF9F6',
        borderWidth: 1,
        borderColor: '#EAECEE',
        borderRadius: 12,
        padding: 16,
        marginBottom: 32,
    },
    dateText: {
        fontFamily: 'Cori',
        fontSize: 16,
        color: '#2C3E50',
        marginLeft: 12,
        flex: 1,
    },
    dateTextEmpty: {
        color: '#BDC3C7',
    },
    clearDateBtn: {
        padding: 4,
    },
    submitBtn: {
        backgroundColor: '#27AE60', // Same green as create elements
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 'auto',
    },
    submitBtnDisabled: {
        opacity: 0.5,
    },
    submitBtnText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#FFFFFF',
    }
});
