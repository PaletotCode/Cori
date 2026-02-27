import { Frown, HeartPulse, Meh, Smile } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import BottomSheetModalCustom from './BottomSheetModalCustom';

interface ModalNovoCheckinProps {
    visible: boolean;
    pacienteId: number;
    onClose: () => void;
    onSuccess: () => void;
}

const NIVEIS_HUMOR = [
    { value: 1, label: 'Muito Mal', color: '#E74C3C', Icon: Frown },
    { value: 2, label: 'Mal', color: '#E67E22', Icon: Frown },
    { value: 3, label: 'Neutro', color: '#F1C40F', Icon: Meh },
    { value: 4, label: 'Bem', color: '#2ECC71', Icon: Smile },
    { value: 5, label: 'Muito Bem', color: '#27AE60', Icon: Smile },
];

export default function ModalNovoCheckin({ visible, pacienteId, onClose, onSuccess }: ModalNovoCheckinProps) {
    const [nivelHumor, setNivelHumor] = useState<number | null>(null);
    const [notas, setNotas] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (visible) {
            setNivelHumor(null);
            setNotas('');
        }
    }, [visible]);

    const handleSalvar = async () => {
        if (!nivelHumor) {
            Alert.alert("Aviso", "Selecione um nível de humor para registrar.");
            return;
        }

        setLoading(true);
        try {
            await api.post('/checkins/', {
                paciente_id: pacienteId,
                nivel_humor: nivelHumor,
                notas: notas.trim() || undefined
            });
            Alert.alert("Sucesso", "Check-in registrado na Timeline.");
            onSuccess();
            onClose();
        } catch (error) {
            console.error(error);
            Alert.alert("Erro", "Falha ao registrar check-in.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <BottomSheetModalCustom visible={visible} onClose={onClose}>
            <ScrollView style={styles.contentContainer} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <View style={styles.iconContainer}>
                        <HeartPulse color="#E74C3C" size={28} />
                    </View>
                    <Text style={styles.title}>Humor do Dia</Text>
                    <Text style={styles.infoText}>Registre como o paciente se sentiu hoje ou neste período.</Text>
                </View>

                <View style={styles.humorScale}>
                    {NIVEIS_HUMOR.map((item) => {
                        const isSelected = nivelHumor === item.value;
                        return (
                            <TouchableOpacity
                                key={item.value}
                                style={[
                                    styles.humorBtn,
                                    isSelected && { backgroundColor: item.color, borderColor: item.color }
                                ]}
                                onPress={() => setNivelHumor(item.value)}
                            >
                                <item.Icon color={isSelected ? '#FFF' : item.color} size={28} />
                                <Text style={[styles.humorLabel, isSelected && { color: '#FFF' }]}>
                                    {item.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View style={[styles.inputGroup, { marginBottom: 24 }]}>
                    <Text style={styles.label}>Notas Opcionais</Text>
                    <TextInput
                        style={styles.textArea}
                        value={notas}
                        onChangeText={setNotas}
                        placeholder="Desabafos, queixas breves, conquistas..."
                        multiline
                        textAlignVertical="top"
                    />
                </View>

                <TouchableOpacity
                    style={[styles.btnAction, loading && styles.btnDisabled]}
                    onPress={handleSalvar}
                    disabled={loading}
                >
                    <Text style={styles.btnActionText}>
                        {loading ? 'Salvando...' : 'Registrar Check-in'}
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
        backgroundColor: '#FDECEA',
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
    infoText: {
        fontFamily: 'Cori',
        fontSize: 14,
        color: '#7F8C8D',
        textAlign: 'center',
        lineHeight: 20
    },
    humorScale: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    humorBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 60,
        height: 80,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#EFEFEF',
        backgroundColor: '#F9FBF9',
    },
    humorLabel: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 10,
        marginTop: 8,
        color: '#7F8C8D',
        textAlign: 'center',
    },
    inputGroup: {
        marginBottom: 16,
    },
    label: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 14,
        color: '#34495E',
        marginBottom: 8,
    },
    textArea: {
        backgroundColor: '#F9FBF9',
        borderWidth: 1,
        borderColor: '#EFEFEF',
        borderRadius: 12,
        padding: 16,
        height: 100,
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#2C3E50',
    },
    btnAction: {
        backgroundColor: '#2C3E50',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#2C3E50',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    btnDisabled: {
        opacity: 0.7,
    },
    btnActionText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#FFFFFF',
    }
});
