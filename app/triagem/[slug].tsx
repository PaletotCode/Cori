import { useLocalSearchParams } from 'expo-router';
import { CheckCircle2, Mail, MessageCircle, User } from 'lucide-react-native';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { apiPublic } from '../../services/apiPublic';
import { PacienteCreate } from '../../types/api';

export default function TriagemScreen() {
    // URL param: cori.app/triagem/[slug]
    const { slug } = useLocalSearchParams<{ slug: string }>();

    const [nomeCompleto, setNomeCompleto] = useState('');
    const [pronomesGenero, setPronomesGenero] = useState('');
    const [dataNascimento, setDataNascimento] = useState('');
    const [naturalidade, setNaturalidade] = useState('');
    const [email, setEmail] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [descricaoClinica, setDescricaoClinica] = useState('');

    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleSubmit = async () => {
        if (!slug) return;
        if (!nomeCompleto.trim()) {
            setErrorMsg('Por favor, preencha o seu nome completo.');
            return;
        }

        setErrorMsg('');
        setLoading(true);

        const payload: PacienteCreate = {
            nome_completo: nomeCompleto,
            pronomes_genero: pronomesGenero || undefined,
            data_nascimento: dataNascimento || undefined,
            naturalidade: naturalidade || undefined,
            meios_comunicacao: {
                whatsapp: whatsapp || undefined,
                email: email || undefined,
            },
            descricao_clinica: descricaoClinica || undefined,
        };

        try {
            await apiPublic.post(`/triagem/${slug}`, payload);
            setSuccess(true);
        } catch (error: any) {
            if (error.response?.status === 404) {
                setErrorMsg('Link inválido. Psicólogo(a) não encontrado.');
            } else {
                setErrorMsg('Ocorreu um erro ao enviar seus dados. Tente novamente.');
            }
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <View style={styles.container}>
                <View style={styles.card}>
                    <CheckCircle2 color="#27AE60" size={64} style={{ marginBottom: 24 }} />
                    <Text style={styles.titleSuccess}>Seus dados foram enviados!</Text>
                    <Text style={styles.subtitleSuccess}>
                        Obrigado por preencher. Seu psicólogo avaliará suas informações e entrará em contato em breve para os próximos passos.
                    </Text>
                </View>
                <Text style={styles.brandText}>Powered by Cori</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <ScrollView
                    contentContainerStyle={styles.scrollGrid}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.cardForm}>
                        <View style={styles.header}>
                            <User color="#2C3E50" size={32} style={{ marginBottom: 16 }} />
                            <Text style={styles.title}>Ficha de Triagem</Text>
                            <Text style={styles.subtitle}>
                                Bem-vindo(a)! Preencha seus dados com cuidado para darmos início ao seu atendimento.
                            </Text>
                        </View>

                        {errorMsg ? (
                            <View style={styles.errorBox}>
                                <Text style={styles.errorText}>{errorMsg}</Text>
                            </View>
                        ) : null}

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>1. Dados Pessoais</Text>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Nome Completo *</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="João da Silva..."
                                    value={nomeCompleto}
                                    onChangeText={setNomeCompleto}
                                    autoCapitalize="words"
                                />
                            </View>

                            <View style={styles.row}>
                                <View style={[styles.inputGroup, { flex: 1, marginRight: 12 }]}>
                                    <Text style={styles.label}>Pronomes</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Ele/Dele, Ela/Dela..."
                                        value={pronomesGenero}
                                        onChangeText={setPronomesGenero}
                                    />
                                </View>
                                <View style={[styles.inputGroup, { flex: 1 }]}>
                                    <Text style={styles.label}>Nascimento</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="AAAA-MM-DD"
                                        value={dataNascimento}
                                        onChangeText={setDataNascimento}
                                    />
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Naturalidade</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Ex: São Paulo, SP"
                                    value={naturalidade}
                                    onChangeText={setNaturalidade}
                                    autoCapitalize="words"
                                />
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>2. Contato</Text>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>WhatsApp</Text>
                                <View style={styles.inputContainerWithIcon}>
                                    <MessageCircle color="#A0AAB5" size={20} />
                                    <TextInput
                                        style={styles.inputIcon}
                                        placeholder="(11) 99999-9999"
                                        value={whatsapp}
                                        onChangeText={setWhatsapp}
                                        keyboardType="phone-pad"
                                    />
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>E-mail</Text>
                                <View style={styles.inputContainerWithIcon}>
                                    <Mail color="#A0AAB5" size={20} />
                                    <TextInput
                                        style={styles.inputIcon}
                                        placeholder="email@exemplo.com"
                                        value={email}
                                        onChangeText={setEmail}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                    />
                                </View>
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>3. O que te traz aqui?</Text>
                            <Text style={styles.hint}>Descreva brevemente o motivo de buscar terapia.</Text>

                            <TextInput
                                style={styles.textArea}
                                placeholder="Pode se abrir à vontade... Suas informações são confidenciais."
                                value={descricaoClinica}
                                onChangeText={setDescricaoClinica}
                                multiline
                                textAlignVertical="top"
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                            onPress={handleSubmit}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <Text style={styles.submitBtnText}>Enviar Formulário</Text>
                            )}
                        </TouchableOpacity>

                    </View>

                    <Text style={styles.brandText}>Powered by Cori - Seu consultório inteligente</Text>
                </ScrollView>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F4F6F8', // Subtle web gray
        justifyContent: 'center',
    },
    scrollGrid: {
        flexGrow: 1,
        alignItems: 'center', // Centers the inner card horizontally
        paddingVertical: 40,
        paddingHorizontal: 20,
    },
    card: {
        backgroundColor: '#FFFFFF',
        width: '100%',
        maxWidth: 400,
        borderRadius: 24,
        padding: 40,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 24,
        elevation: 5,
        alignSelf: 'center',
    },
    cardForm: {
        backgroundColor: '#FFFFFF',
        width: '100%',
        maxWidth: 600, // Wider for forms (Web Desktop friendly)
        borderRadius: 24,
        padding: 32,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 24,
        elevation: 5,
        borderWidth: 1,
        borderColor: '#EFEFEF',
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    title: {
        fontFamily: 'Cori-Bold',
        fontSize: 26,
        color: '#2C3E50',
        marginBottom: 8,
        textAlign: 'center',
    },
    titleSuccess: {
        fontFamily: 'Cori-Bold',
        fontSize: 24,
        color: '#27AE60',
        marginBottom: 16,
        textAlign: 'center',
    },
    subtitle: {
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#7F8C8D',
        textAlign: 'center',
        lineHeight: 24,
    },
    subtitleSuccess: {
        fontFamily: 'Cori',
        fontSize: 16,
        color: '#7F8C8D',
        textAlign: 'center',
        lineHeight: 24,
    },
    errorBox: {
        backgroundColor: '#FDECEA',
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#FADBD8',
    },
    errorText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 14,
        color: '#E74C3C',
        textAlign: 'center',
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#2C3E50',
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
        paddingBottom: 8,
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
    hint: {
        fontFamily: 'Cori',
        fontSize: 13,
        color: '#A0AAB5',
        marginBottom: 12,
        marginTop: -8,
    },
    input: {
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
    inputContainerWithIcon: {
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
        flex: 1,
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#2C3E50',
        marginLeft: 12,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    textArea: {
        backgroundColor: '#F9FBF9',
        borderWidth: 1,
        borderColor: '#EFEFEF',
        borderRadius: 12,
        padding: 16,
        height: 120, // ample space for text
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#2C3E50',
    },
    submitBtn: {
        backgroundColor: '#2C3E50',
        paddingVertical: 18,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#2C3E50',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
        marginTop: 16,
    },
    submitBtnDisabled: {
        opacity: 0.7,
    },
    submitBtnText: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#FFFFFF',
    },
    brandText: {
        fontFamily: 'Cori-Medium',
        fontSize: 12,
        color: '#BDC3C7',
        marginTop: 32,
        textAlign: 'center',
        alignSelf: 'center',
    }
});
