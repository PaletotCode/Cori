import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions, KeyboardAvoidingView, Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

const { width } = Dimensions.get('window');

// Tipos para o estado do formulário
interface WizardState {
    nome_exibicao: string;
    crp: string;
    duracao_sessao_padrao_minutos: number;
    intervalo_sessao_padrao_minutos: number;
    dias_atendimento: string[];
    modelo_cobranca_padrao: string;
    valor_sessao_padrao: string;
    chave_pix: string;
    enviar_lembretes_automaticos: boolean;
    antecedencia_lembrete_horas: number;
    cobrar_faltas_nao_avisadas: boolean;
}

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const MODELOS_COBRANCA = [
    { id: 'por_sessao', label: 'Por Sessão (Avulso)' },
    { id: 'pacote_mensal_pos', label: 'Pacote Mensal (Pós-pago)' },
    { id: 'pacote_mensal_pre', label: 'Pacote Mensal (Pré-pago)' },
];

export default function WizardScreen() {
    const { psicologo, checkAuth } = useAuthStore();
    const scrollRef = useRef<ScrollView>(null);

    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [form, setForm] = useState<WizardState>({
        nome_exibicao: psicologo?.nome_exibicao || '',
        crp: psicologo?.crp || '',
        duracao_sessao_padrao_minutos: 50,
        intervalo_sessao_padrao_minutos: 10,
        dias_atendimento: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
        modelo_cobranca_padrao: 'por_sessao',
        valor_sessao_padrao: '',
        chave_pix: '',
        enviar_lembretes_automaticos: true,
        antecedencia_lembrete_horas: 24,
        cobrar_faltas_nao_avisadas: false,
    });

    const updateForm = (key: keyof WizardState, value: any) => {
        setForm(prev => ({ ...prev, [key]: value }));
    };

    const toggleDia = (dia: string) => {
        const dias = form.dias_atendimento;
        if (dias.includes(dia)) {
            updateForm('dias_atendimento', dias.filter(d => d !== dia));
        } else {
            updateForm('dias_atendimento', [...dias, dia]);
        }
    };

    const handleNext = () => {
        if (currentStep < 3) {
            const nextStep = currentStep + 1;
            setCurrentStep(nextStep);
            scrollRef.current?.scrollTo({ x: nextStep * width, animated: true });
        } else {
            submitWizard();
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            const prevStep = currentStep - 1;
            setCurrentStep(prevStep);
            scrollRef.current?.scrollTo({ x: prevStep * width, animated: true });
        }
    };

    const submitWizard = async () => {
        setIsSubmitting(true);
        try {
            const payload = {
                ...form,
                valor_sessao_padrao: form.valor_sessao_padrao ? parseFloat(form.valor_sessao_padrao.replace(',', '.')) : null
            };

            await api.patch('/auth/onboarding', payload);

            // Atualiza global state (forçando o redirect no layout)
            await checkAuth();

        } catch (error) {
            console.error('Erro no onboarding:', error);
            Alert.alert("Erro", "Não foi possível salvar as configurações. Tente novamente.");
            setIsSubmitting(false);
        }
    };

    const renderDots = () => {
        return (
            <View style={styles.dotsContainer}>
                {[0, 1, 2, 3].map(step => (
                    <View
                        key={step}
                        style={[
                            styles.dot,
                            currentStep === step && styles.dotActive,
                            currentStep > step && styles.dotCompleted
                        ]}
                    />
                ))}
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={styles.header}>
                {renderDots()}
                <Text style={styles.stepsText}>Passo {currentStep + 1} de 4</Text>
            </View>

            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
            >
                {/* PASSO 1: Identidade */}
                <View style={styles.slide}>
                    <Text style={styles.title}>A Cara da Clínica</Text>
                    <Text style={styles.subtitle}>Como você quer que seus pacientes te vejam?</Text>

                    <View style={styles.avatarContainer}>
                        <View style={styles.avatarPlaceholder}>
                            <FontAwesome name="user" size={40} color="#BDC3C7" />
                        </View>
                        <Text style={styles.avatarInfo}>A foto de perfil poderá ser alterada nas configurações.</Text>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Como você quer ser chamado?</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ex: Dra. Ana Silva"
                            value={form.nome_exibicao}
                            onChangeText={(t) => updateForm('nome_exibicao', t)}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Qual o seu número de CRP?</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ex: 06/123456"
                            value={form.crp}
                            onChangeText={(t) => updateForm('crp', t)}
                        />
                    </View>
                </View>

                {/* PASSO 2: O Relógio */}
                <View style={styles.slide}>
                    <Text style={styles.title}>O Relógio</Text>
                    <Text style={styles.subtitle}>Vamos configurar sua agenda padrão.</Text>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Duração padrão das sessões:</Text>
                        <View style={styles.rowButtons}>
                            {[45, 50, 60].map(min => (
                                <TouchableOpacity
                                    key={min}
                                    style={[styles.chip, form.duracao_sessao_padrao_minutos === min && styles.chipActive]}
                                    onPress={() => updateForm('duracao_sessao_padrao_minutos', min)}
                                >
                                    <Text style={[styles.chipText, form.duracao_sessao_padrao_minutos === min && styles.chipTextActive]}>{min} min</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Intervalo entre pacientes:</Text>
                        <View style={styles.rowButtons}>
                            {[0, 10, 15, 30].map(min => (
                                <TouchableOpacity
                                    key={min}
                                    style={[styles.chip, form.intervalo_sessao_padrao_minutos === min && styles.chipActive]}
                                    onPress={() => updateForm('intervalo_sessao_padrao_minutos', min)}
                                >
                                    <Text style={[styles.chipText, form.intervalo_sessao_padrao_minutos === min && styles.chipTextActive]}>
                                        {min === 0 ? 'Sem intervalo' : `${min} min`}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Dias da semana que você atende:</Text>
                        <View style={styles.rowButtonsWrap}>
                            {DIAS_SEMANA.map(dia => {
                                const active = form.dias_atendimento.includes(dia);
                                return (
                                    <TouchableOpacity
                                        key={dia}
                                        style={[styles.chip, active && styles.chipActive]}
                                        onPress={() => toggleDia(dia)}
                                    >
                                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{dia}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                </View>

                {/* PASSO 3: O Bolso */}
                <View style={styles.slide}>
                    <Text style={styles.title}>O Bolso</Text>
                    <Text style={styles.subtitle}>Motor Financeiro da sua Clínica.</Text>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Modelo de cobrança mais comum:</Text>
                        {MODELOS_COBRANCA.map(mod => (
                            <TouchableOpacity
                                key={mod.id}
                                style={[styles.cardButton, form.modelo_cobranca_padrao === mod.id && styles.cardButtonActive]}
                                onPress={() => updateForm('modelo_cobranca_padrao', mod.id)}
                            >
                                <Text style={[styles.cardButtonText, form.modelo_cobranca_padrao === mod.id && styles.cardButtonTextActive]}>{mod.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Valor padrão da sessão (R$):</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ex: 150,00"
                            keyboardType="numeric"
                            value={form.valor_sessao_padrao}
                            onChangeText={(t) => updateForm('valor_sessao_padrao', t)}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Chave PIX padrão para recebimentos:</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="CPF, E-mail ou Celular"
                            value={form.chave_pix}
                            onChangeText={(t) => updateForm('chave_pix', t)}
                        />
                    </View>
                </View>

                {/* PASSO 4: O Assistente */}
                <View style={styles.slide}>
                    <Text style={styles.title}>O Assistente</Text>
                    <Text style={styles.subtitle}>Regras de Engajamento e Lembretes automáticos.</Text>

                    <View style={styles.switchRow}>
                        <View style={{ flex: 1, paddingRight: 16 }}>
                            <Text style={styles.label}>Enviar lembretes no WhatsApp para confirmar sessão?</Text>
                            <Text style={styles.subtext}>O Cori enviará um link inteligente para o paciente confirmar ou reagendar.</Text>
                        </View>
                        <Switch
                            value={form.enviar_lembretes_automaticos}
                            onValueChange={(val) => updateForm('enviar_lembretes_automaticos', val)}
                            trackColor={{ false: "#E0E0E0", true: "#4ECDC4" }}
                        />
                    </View>

                    {form.enviar_lembretes_automaticos && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Com qual antecedência?</Text>
                            <View style={styles.rowButtons}>
                                {[24, 48].map(horas => (
                                    <TouchableOpacity
                                        key={horas}
                                        style={[styles.chip, form.antecedencia_lembrete_horas === horas && styles.chipActive]}
                                        onPress={() => updateForm('antecedencia_lembrete_horas', horas)}
                                    >
                                        <Text style={[styles.chipText, form.antecedencia_lembrete_horas === horas && styles.chipTextActive]}>{horas}h antes</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}

                    <View style={[styles.switchRow, { marginTop: 24 }]}>
                        <View style={{ flex: 1, paddingRight: 16 }}>
                            <Text style={styles.label}>Faltas não avisadas devem ser cobradas?</Text>
                            <Text style={styles.subtext}>Pacientes que não comparecerem sem aviso prévio terão a sessão lançada na fatura.</Text>
                        </View>
                        <Switch
                            value={form.cobrar_faltas_nao_avisadas}
                            onValueChange={(val) => updateForm('cobrar_faltas_nao_avisadas', val)}
                            trackColor={{ false: "#E0E0E0", true: "#FF6B6B" }}
                        />
                    </View>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    {currentStep > 0 ? (
                        <TouchableOpacity style={styles.footerBtnBack} onPress={handleBack} disabled={isSubmitting}>
                            <Text style={styles.footerBtnBackText}>Voltar</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={{ width: 80 }} /> // Espaçador vago
                    )}

                    <TouchableOpacity
                        style={[styles.footerBtnNext, isSubmitting && { opacity: 0.7 }]}
                        onPress={handleNext}
                        disabled={isSubmitting || (currentStep === 0 && !form.nome_exibicao.trim())}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <Text style={styles.footerBtnNextText}>{currentStep === 3 ? 'Finalizar' : 'Continuar'}</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAF9F6',
    },
    header: {
        paddingTop: 60,
        paddingBottom: 20,
        alignItems: 'center',
    },
    dotsContainer: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#E0E0E0',
        marginHorizontal: 4,
    },
    dotActive: {
        backgroundColor: '#2C3E50',
        width: 24,
    },
    dotCompleted: {
        backgroundColor: '#2C3E50',
    },
    stepsText: {
        fontFamily: 'Cori',
        fontSize: 14,
        color: '#7F8C8D',
    },
    slide: {
        width: width,
        padding: 24,
    },
    title: {
        fontFamily: 'Cori-Bold',
        fontSize: 32,
        color: '#2C3E50',
        marginBottom: 8,
    },
    subtitle: {
        fontFamily: 'Cori',
        fontSize: 16,
        color: '#7F8C8D',
        marginBottom: 32,
    },
    inputGroup: {
        marginBottom: 24,
    },
    label: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 16,
        color: '#2C3E50',
        marginBottom: 8,
    },
    subtext: {
        fontFamily: 'Cori',
        fontSize: 13,
        color: '#95A5A6',
        marginTop: 4,
    },
    input: {
        borderWidth: 1,
        borderColor: '#E0E0E0',
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        fontFamily: 'Cori',
        color: '#333',
    },
    avatarContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#EFEFEF',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#E0E0E0',
        borderStyle: 'dashed',
        marginBottom: 12,
    },
    avatarInfo: {
        fontFamily: 'Cori',
        fontSize: 14,
        color: '#95A5A6',
        textAlign: 'center',
    },
    rowButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    rowButtonsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E0E0E0',
        borderRadius: 20,
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    chipActive: {
        backgroundColor: '#2C3E50',
        borderColor: '#2C3E50',
    },
    chipText: {
        fontFamily: 'Cori-Medium',
        color: '#7F8C8D',
        fontSize: 14,
    },
    chipTextActive: {
        color: '#FFFFFF',
    },
    cardButton: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E0E0E0',
        borderRadius: 12,
        padding: 16,
        marginBottom: 8,
    },
    cardButtonActive: {
        backgroundColor: '#E8F5E9',
        borderColor: '#4CAF50',
    },
    cardButtonText: {
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#333',
    },
    cardButtonTextActive: {
        color: '#2E7D32',
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E0E0E0',
    },
    footer: {
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        backgroundColor: '#FAF9F6',
        borderTopWidth: 1,
        borderTopColor: '#EFEFEF',
    },
    footerBtnNext: {
        backgroundColor: '#2C3E50',
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 140,
    },
    footerBtnNextText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#FFF',
    },
    footerBtnBack: {
        paddingVertical: 16,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footerBtnBackText: {
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#7F8C8D',
    },
});
