import DateTimePicker from '@react-native-community/datetimepicker';
import { addHours, format } from 'date-fns';
import { X } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../services/api';

interface Props {
    visible: boolean;
    pacienteId: number;
    onClose: () => void;
    onSuccess: () => void;
}

export default function ModalNovaSessao({ visible, pacienteId, onClose, onSuccess }: Props) {
    const [loading, setLoading] = useState(false);

    // Base State
    const [dataInicio, setDataInicio] = useState(new Date());
    const [dataFim, setDataFim] = useState(addHours(new Date(), 1));

    // Recurrence State
    const [recorrente, setRecorrente] = useState(false);
    const [frequenciaDias, setFrequenciaDias] = useState('7');
    const [totalSessoes, setTotalSessoes] = useState('4');

    // Picker visibility
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const payload: any = {
                paciente_id: pacienteId,
                data_hora_inicio: dataInicio.toISOString(),
                data_hora_fim: dataFim.toISOString(),
            };

            if (recorrente) {
                payload.frequencia_dias = parseInt(frequenciaDias, 10) || 7;
                payload.total_sessoes = parseInt(totalSessoes, 10) || 4;
            }

            await api.post('/sessoes/', payload);
            Alert.alert('Sucesso', 'Sessão agendada com sucesso!');
            onSuccess();
            handleClose();
        } catch (error: any) {
            Alert.alert('Erro', error.response?.data?.detail || 'Erro ao criar sessão');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        // Reset state before close
        setDataInicio(new Date());
        setDataFim(addHours(new Date(), 1));
        setRecorrente(false);
        setFrequenciaDias('7');
        setTotalSessoes('4');
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
                        <Text style={styles.title}>Nova Sessão</Text>
                        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                            <X color="#2C3E50" size={24} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.form}>
                        {/* Start Time */}
                        <Text style={styles.label}>Início</Text>
                        <TouchableOpacity
                            style={styles.dateSelector}
                            onPress={() => setShowStartPicker(true)}
                        >
                            <Text style={styles.dateText}>{format(dataInicio, 'dd/MM/yyyy HH:mm')}</Text>
                        </TouchableOpacity>

                        {showStartPicker && (
                            <DateTimePicker
                                value={dataInicio}
                                mode="datetime"
                                display="default"
                                onChange={(event, date) => {
                                    setShowStartPicker(false);
                                    if (date) {
                                        setDataInicio(date);
                                        // auto push end time if invalid
                                        if (date >= dataFim) {
                                            setDataFim(addHours(date, 1));
                                        }
                                    }
                                }}
                            />
                        )}

                        {/* End Time */}
                        <Text style={styles.label}>Fim</Text>
                        <TouchableOpacity
                            style={styles.dateSelector}
                            onPress={() => setShowEndPicker(true)}
                        >
                            <Text style={styles.dateText}>{format(dataFim, 'dd/MM/yyyy HH:mm')}</Text>
                        </TouchableOpacity>

                        {showEndPicker && (
                            <DateTimePicker
                                value={dataFim}
                                mode="datetime"
                                display="default"
                                onChange={(event, date) => {
                                    setShowEndPicker(false);
                                    if (date) setDataFim(date);
                                }}
                            />
                        )}

                        {/* Recurrence Switch */}
                        <View style={styles.switchRow}>
                            <Text style={styles.switchLabel}>Sessão Recorrente</Text>
                            <Switch
                                value={recorrente}
                                onValueChange={setRecorrente}
                                trackColor={{ false: '#EAECEE', true: '#27AE60' }}
                                thumbColor="#FFFFFF"
                            />
                        </View>

                        {/* Recurrence Fields */}
                        {recorrente && (
                            <View style={styles.recurrenceContainer}>
                                <View style={styles.halfInput}>
                                    <Text style={styles.label}>Intervalo (Dias)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={frequenciaDias}
                                        onChangeText={setFrequenciaDias}
                                        keyboardType="number-pad"
                                        placeholder="Ex: 7"
                                        placeholderTextColor="#BDC3C7"
                                    />
                                </View>
                                <View style={styles.halfInput}>
                                    <Text style={styles.label}>Qntd Ocorrências</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={totalSessoes}
                                        onChangeText={setTotalSessoes}
                                        keyboardType="number-pad"
                                        placeholder="Ex: 4"
                                        placeholderTextColor="#BDC3C7"
                                    />
                                </View>
                            </View>
                        )}

                        <TouchableOpacity
                            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                            onPress={handleSubmit}
                            disabled={loading}
                        >
                            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Agendar</Text>}
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
    dateSelector: {
        backgroundColor: '#FAF9F6',
        borderWidth: 1,
        borderColor: '#EAECEE',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
    },
    dateText: {
        fontFamily: 'Cori',
        fontSize: 16,
        color: '#2C3E50',
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
        marginBottom: 16,
    },
    switchLabel: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 16,
        color: '#2C3E50',
    },
    recurrenceContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    halfInput: {
        width: '48%',
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
    },
    submitBtn: {
        backgroundColor: '#27AE60',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 'auto',
    },
    submitBtnDisabled: {
        opacity: 0.7,
    },
    submitBtnText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#FFFFFF',
    }
});
