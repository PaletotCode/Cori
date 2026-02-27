import DateTimePicker from '@react-native-community/datetimepicker';
import { addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Tag, X } from 'lucide-react-native';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { api } from '../../services/api';

interface Props {
    visible: boolean;
    pacienteId: number;
    onClose: () => void;
    onSuccess: () => void;
}

export default function ModalGerarFatura({ visible, pacienteId, onClose, onSuccess }: Props) {
    const defaultDataVencimento = addDays(new Date(), 5);
    const currentDate = new Date();

    const [mesReferencia, setMesReferencia] = useState(String(currentDate.getMonth() + 1));
    const [anoReferencia, setAnoReferencia] = useState(String(currentDate.getFullYear()));
    const [dataVencimento, setDataVencimento] = useState(defaultDataVencimento);
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [loading, setLoading] = useState(false);

    const handleSalvar = async () => {
        const mes = parseInt(mesReferencia, 10);
        const ano = parseInt(anoReferencia, 10);

        if (isNaN(mes) || mes < 1 || mes > 12) {
            Alert.alert('Atenção', 'Mês inválido. Digite de 1 a 12.');
            return;
        }

        if (isNaN(ano) || ano < 2000 || ano > 2100) {
            Alert.alert('Atenção', 'Ano inválido.');
            return;
        }

        setLoading(true);
        try {
            await api.post(`/faturas/gerar/${pacienteId}`, {
                mes_referencia: mes,
                ano_referencia: ano,
                data_vencimento: format(dataVencimento, 'yyyy-MM-dd')
            });
            Alert.alert('Sucesso', 'Fatura gerada com sucesso!', [
                { text: 'OK', onPress: () => { onClose(); onSuccess(); } }
            ]);
        } catch (error: any) {
            if (error.response?.status === 422) {
                Alert.alert('Sem sessões elegíveis', 'Não há sessões cobráveis ("Realizada" ou "Falta Cobrada") sem fatura neste mês/ano.');
            } else {
                Alert.alert('Erro', 'Não foi possível gerar a fatura.');
            }
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
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.modalContainer}>

                        {/* Header */}
                        <View style={styles.header}>
                            <View>
                                <Text style={styles.headerTitle}>Gerar Fatura</Text>
                                <Text style={styles.headerSubtitle}>Fecho de Mês</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <X color="#7F8C8D" size={24} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.content}>

                            {/* Row: Mês & Ano */}
                            <View style={styles.row}>
                                <View style={[styles.inputGroup, { flex: 1, marginRight: 12 }]}>
                                    <Text style={styles.label}>Mês de Referência</Text>
                                    <View style={styles.inputContainer}>
                                        <Tag color="#A0AAB5" size={20} style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            value={mesReferencia}
                                            onChangeText={setMesReferencia}
                                            keyboardType="numeric"
                                            placeholder="Ex: 10"
                                            maxLength={2}
                                        />
                                    </View>
                                </View>

                                <View style={[styles.inputGroup, { flex: 1 }]}>
                                    <Text style={styles.label}>Ano</Text>
                                    <View style={styles.inputContainer}>
                                        <Tag color="#A0AAB5" size={20} style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            value={anoReferencia}
                                            onChangeText={setAnoReferencia}
                                            keyboardType="numeric"
                                            placeholder="Ex: 2026"
                                            maxLength={4}
                                        />
                                    </View>
                                </View>
                            </View>

                            {/* Data Vencimento */}
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Data de Vencimento</Text>
                                <TouchableOpacity
                                    style={styles.dateSelector}
                                    onPress={() => setShowDatePicker(true)}
                                >
                                    <Calendar color="#2C3E50" size={20} style={styles.dateIcon} />
                                    <Text style={styles.dateText}>
                                        {format(dataVencimento, "dd 'de' MMMM, yyyy", { locale: ptBR })}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {showDatePicker && (
                                <DateTimePicker
                                    value={dataVencimento}
                                    mode="date"
                                    display="default"
                                    onChange={(event, date) => {
                                        setShowDatePicker(false);
                                        if (date) setDataVencimento(date);
                                    }}
                                />
                            )}

                            {/* Hint */}
                            <Text style={styles.hintText}>
                                Ao gerar, o sistema vai procurar todas as sessões "Realizadas" ou "Faltas Cobradas" neste mês que ainda não tem fatura e consolidá-las.
                            </Text>

                            <TouchableOpacity
                                style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
                                onPress={handleSalvar}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                    <Text style={styles.saveBtnText}>Gerar Fatura Agora</Text>
                                )}
                            </TouchableOpacity>

                        </View>
                    </View>
                </TouchableWithoutFeedback>
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
    modalContainer: {
        backgroundColor: '#FAF9F6',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 40,
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
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    headerTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 20,
        color: '#2C3E50',
    },
    headerSubtitle: {
        fontFamily: 'Cori-Medium',
        fontSize: 14,
        color: '#7F8C8D',
        marginTop: 2,
    },
    closeBtn: {
        padding: 8,
        backgroundColor: '#F9FBF9',
        borderRadius: 20,
    },
    content: {
        padding: 24,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontFamily: 'Cori-Bold',
        fontSize: 14,
        color: '#2C3E50',
        marginBottom: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#EFEFEF',
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 52,
    },
    inputIcon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#2C3E50',
    },
    dateSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#EFEFEF',
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 52,
    },
    dateIcon: {
        marginRight: 12,
    },
    dateText: {
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#2C3E50',
    },
    hintText: {
        fontFamily: 'Cori',
        fontSize: 13,
        color: '#A0AAB5',
        lineHeight: 18,
        marginBottom: 24,
        textAlign: 'center',
        paddingHorizontal: 8,
    },
    saveBtn: {
        backgroundColor: '#27AE60', // Financial/Green
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#27AE60',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    saveBtnDisabled: {
        opacity: 0.7,
    },
    saveBtnText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#FFFFFF',
    }
});
