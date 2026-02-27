import { FileText, Phone, User, Users } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../services/api';

interface Props {
    onComplete: () => void;
}

export default function FirstAccessTriagem({ onComplete }: Props) {
    const [nome, setNome] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [queixa, setQueixa] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!nome.trim()) {
            Alert.alert("Aviso", "O nome do paciente é obrigatório para começar.");
            return;
        }

        setLoading(true);
        try {
            await api.post('/pacientes/', {
                nome_completo: nome,
                status: 'ativo',
                meios_comunicacao: whatsapp ? { whatsapp } : undefined,
                descricao_clinica: queixa || undefined
            });
            onComplete(); // Tells parent to re-fetch and unmount this view
        } catch (error: any) {
            console.error('Error creating first patient:', error.message);
            Alert.alert("Erro", "Não foi possível criar o paciente. Tente novamente.");
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <View style={styles.iconCircle}>
                        <Users color="#2C3E50" size={32} />
                    </View>
                    <Text style={styles.title}>Bem-vindo ao Cori</Text>
                    <Text style={styles.subtitle}>
                        Seu consultório digital está pronto! Para liberar a agenda e as ferramentas, cadastre seu primeiro paciente.
                    </Text>
                </View>

                <View style={styles.formCard}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Nome completo do Paciente *</Text>
                        <View style={styles.inputWrapper}>
                            <User color="#A0AAB5" size={20} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Ex: Maria Alice"
                                placeholderTextColor="#A0AAB5"
                                value={nome}
                                onChangeText={setNome}
                            />
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>WhatsApp do Paciente</Text>
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
                        <Text style={styles.label}>Breve Descrição / Queixa Inicial</Text>
                        <View style={styles.inputWrapperArea}>
                            <FileText color="#A0AAB5" size={20} style={styles.inputIconArea} />
                            <TextInput
                                style={styles.inputArea}
                                placeholder="Um breve resumo do caso..."
                                placeholderTextColor="#A0AAB5"
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                                value={queixa}
                                onChangeText={setQueixa}
                            />
                        </View>
                    </View>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.submitBtn, !nome.trim() && styles.submitBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={!nome.trim() || loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                        <Text style={styles.submitBtnText}>Cadastrar e Iniciar</Text>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAF9F6',
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
    },
    header: {
        alignItems: 'center',
        marginTop: 32,
        marginBottom: 40,
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#EDF2F7',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    title: {
        fontFamily: 'Cori-Bold',
        fontSize: 28,
        color: '#2C3E50',
        marginBottom: 12,
        textAlign: 'center',
    },
    subtitle: {
        fontFamily: 'Cori',
        fontSize: 16,
        color: '#7F8C8D',
        textAlign: 'center',
        lineHeight: 24,
        paddingHorizontal: 16,
    },
    formCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 4,
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
        paddingVertical: 24,
        paddingHorizontal: 24,
        backgroundColor: '#FAF9F6',
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
    },
    submitBtn: {
        backgroundColor: '#2C3E50',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#2C3E50',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    submitBtnDisabled: {
        backgroundColor: '#A0AAB5',
        shadowOpacity: 0,
        elevation: 0,
    },
    submitBtnText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#FFFFFF',
    }
});
