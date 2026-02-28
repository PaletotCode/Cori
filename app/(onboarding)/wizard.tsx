import { Check, ChevronLeft, ChevronRight, Clock, Wallet } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Keyboard,
    KeyboardAvoidingView, Platform,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

const { width } = Dimensions.get('window');

interface WizardState {
    nome_exibicao: string;
    crp: string;
    duracao_sessao_padrao_minutos: number;
    intervalo_sessao_padrao_minutos: number;
    dias_atendimento: string[];
    modelo_cobranca_padrao: string;
    valor_sessao_padrao: string;
    cobrar_faltas_nao_avisadas: boolean;
}

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const DURACAO_OPCOES = [45, 50, 60];
const INTERVALO_OPCOES = [0, 10, 15, 30];

export default function WizardScreen() {
    const { psicologo, checkAuth } = useAuthStore();
    const flatListRef = useRef<FlatList>(null);

    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Controle de campos "Personalizados"
    const [customDuracao, setCustomDuracao] = useState(false);
    const [customIntervalo, setCustomIntervalo] = useState(false);

    const [form, setForm] = useState<WizardState>({
        nome_exibicao: psicologo?.nome_exibicao || '',
        crp: psicologo?.crp || '',
        duracao_sessao_padrao_minutos: 50,
        intervalo_sessao_padrao_minutos: 10,
        dias_atendimento: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
        modelo_cobranca_padrao: 'por_sessao',
        valor_sessao_padrao: '',
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
        Keyboard.dismiss();
        if (currentStep < 2) {
            const nextStep = currentStep + 1;
            flatListRef.current?.scrollToIndex({ index: nextStep, animated: true });
            setCurrentStep(nextStep);
        } else {
            submitWizard();
        }
    };

    const handleBack = () => {
        Keyboard.dismiss();
        if (currentStep > 0) {
            const prevStep = currentStep - 1;
            flatListRef.current?.scrollToIndex({ index: prevStep, animated: true });
            setCurrentStep(prevStep);
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
            await checkAuth(); // Redireciona via layout guard

        } catch (error) {
            console.error('Erro no onboarding:', error);
            Alert.alert("Erro", "Não foi possível salvar as configurações. Tente novamente.");
            setIsSubmitting(false);
        }
    };

    const isStep1Valid = form.nome_exibicao.trim().length > 0;
    const isStep2Valid = form.dias_atendimento.length > 0 && form.duracao_sessao_padrao_minutos > 0;

    const renderSlide1 = () => (
        <View style={{ width, paddingHorizontal: 24, paddingTop: 32 }}>
            <View className="items-center mb-8">
                <Text className="font-cori-bold text-4xl text-slate-800 text-center mb-4 leading-tight">
                    Seja muito bem-vindo ao Cori! ✨
                </Text>
                <Text className="font-cori text-base text-slate-500 text-center px-4 leading-relaxed">
                    Vamos preparar o seu consultório digital. Como você gosta de ser chamado(a) pelos seus pacientes?
                </Text>
            </View>

            <View className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <View className="mb-6">
                    <Text className="font-cori-medium text-slate-700 mb-2 ml-1">Nome de Exibição <Text className="text-red-400">*</Text></Text>
                    <TextInput
                        className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-base font-cori text-slate-800"
                        placeholder="Ex: Dra. Ana Silva"
                        placeholderTextColor="#9ca3af"
                        value={form.nome_exibicao}
                        onChangeText={(t) => updateForm('nome_exibicao', t)}
                    />
                </View>

                <View>
                    <Text className="font-cori-medium text-slate-700 mb-2 ml-1">CRP (Opcional)</Text>
                    <TextInput
                        className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-base font-cori text-slate-800"
                        placeholder="Ex: 06/123456"
                        placeholderTextColor="#9ca3af"
                        value={form.crp}
                        onChangeText={(t) => updateForm('crp', t)}
                    />
                    <Text className="font-cori text-xs text-slate-400 mt-2 ml-1">
                        Você pode adicionar ou alterar isso depois nas configurações.
                    </Text>
                </View>
            </View>
        </View>
    );

    const renderSlide2 = () => (
        <View style={{ width, paddingHorizontal: 24, paddingTop: 32 }}>
            <View className="flex-row items-center justify-center mb-6">
                <View className="bg-blue-50 p-4 rounded-full">
                    <Clock size={32} color="#3b82f6" />
                </View>
            </View>
            <Text className="font-cori-bold text-3xl text-slate-800 text-center mb-2">
                Como funciona o seu tempo?
            </Text>
            <Text className="font-cori text-base text-slate-500 text-center mb-8">
                Ajuste os horários da sua agenda padrão. Padrões ajudam a automatizar a sua rotina.
            </Text>

            {/* Duração da Sessão */}
            <View className="mb-8">
                <Text className="font-cori-medium text-slate-700 mb-3 ml-1">Duração da sessão</Text>
                <View className="flex-row flex-wrap gap-2">
                    {DURACAO_OPCOES.map(min => (
                        <TouchableOpacity
                            key={min}
                            onPress={() => { setCustomDuracao(false); updateForm('duracao_sessao_padrao_minutos', min); }}
                            className={`px-5 py-3 rounded-2xl border ${!customDuracao && form.duracao_sessao_padrao_minutos === min ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}
                        >
                            <Text className={`font-cori-medium ${!customDuracao && form.duracao_sessao_padrao_minutos === min ? 'text-white' : 'text-slate-600'}`}>{min} min</Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                        onPress={() => setCustomDuracao(true)}
                        className={`px-5 py-3 rounded-2xl border ${customDuracao ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}
                    >
                        <Text className={`font-cori-medium ${customDuracao ? 'text-white' : 'text-slate-600'}`}>Personalizado</Text>
                    </TouchableOpacity>
                </View>
                {customDuracao && (
                    <View className="mt-3 flex-row items-center">
                        <TextInput
                            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-base font-cori text-slate-800"
                            placeholder="Digite os minutos..."
                            keyboardType="numeric"
                            value={String(form.duracao_sessao_padrao_minutos)}
                            onChangeText={(t) => updateForm('duracao_sessao_padrao_minutos', parseInt(t) || 0)}
                        />
                        <Text className="font-cori-medium text-slate-500 ml-3">minutos</Text>
                    </View>
                )}
            </View>

            {/* Intervalo */}
            <View className="mb-8">
                <Text className="font-cori-medium text-slate-700 mb-3 ml-1">Intervalo entre sessões</Text>
                <View className="flex-row flex-wrap gap-2">
                    {INTERVALO_OPCOES.map(min => (
                        <TouchableOpacity
                            key={min}
                            onPress={() => { setCustomIntervalo(false); updateForm('intervalo_sessao_padrao_minutos', min); }}
                            className={`px-5 py-3 rounded-2xl border ${!customIntervalo && form.intervalo_sessao_padrao_minutos === min ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}
                        >
                            <Text className={`font-cori-medium ${!customIntervalo && form.intervalo_sessao_padrao_minutos === min ? 'text-white' : 'text-slate-600'}`}>
                                {min === 0 ? 'Nenhum' : `${min} min`}
                            </Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                        onPress={() => setCustomIntervalo(true)}
                        className={`px-5 py-3 rounded-2xl border ${customIntervalo ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}
                    >
                        <Text className={`font-cori-medium ${customIntervalo ? 'text-white' : 'text-slate-600'}`}>Outro</Text>
                    </TouchableOpacity>
                </View>
                {customIntervalo && (
                    <View className="mt-3 flex-row items-center">
                        <TextInput
                            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-base font-cori text-slate-800"
                            placeholder="Digite os minutos..."
                            keyboardType="numeric"
                            value={String(form.intervalo_sessao_padrao_minutos)}
                            onChangeText={(t) => updateForm('intervalo_sessao_padrao_minutos', parseInt(t) || 0)}
                        />
                        <Text className="font-cori-medium text-slate-500 ml-3">minutos</Text>
                    </View>
                )}
            </View>

            {/* Dias da Semana */}
            <View>
                <Text className="font-cori-medium text-slate-700 mb-3 ml-1">Dias de atendimento base</Text>
                <View className="flex-row flex-wrap gap-2">
                    {DIAS_SEMANA.map(dia => {
                        const active = form.dias_atendimento.includes(dia);
                        return (
                            <TouchableOpacity
                                key={dia}
                                onPress={() => toggleDia(dia)}
                                className={`w-14 items-center py-3 rounded-2xl border ${active ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}
                            >
                                <Text className={`font-cori-medium ${active ? 'text-blue-600' : 'text-slate-500'}`}>{dia}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        </View>
    );

    const renderSlide3 = () => (
        <View style={{ width, paddingHorizontal: 24, paddingTop: 32 }}>
            <View className="flex-row items-center justify-center mb-6">
                <View className="bg-emerald-50 p-4 rounded-full">
                    <Wallet size={32} color="#10b981" />
                </View>
            </View>
            <Text className="font-cori-bold text-3xl text-slate-800 text-center mb-2">
                Regras do Consultório
            </Text>
            <Text className="font-cori text-base text-slate-500 text-center mb-8">
                Defina sua política para facilitar a gestão financeira e cobranças no futuro.
            </Text>

            <View className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-6">
                <Text className="font-cori-medium text-slate-700 mb-3">Qual o seu modelo de cobrança base?</Text>

                <TouchableOpacity
                    onPress={() => updateForm('modelo_cobranca_padrao', 'por_sessao')}
                    className={`flex-row items-center p-4 rounded-2xl border mb-3 ${form.modelo_cobranca_padrao === 'por_sessao' ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-200'}`}
                >
                    <View className={`w-5 h-5 rounded-full border items-center justify-center mr-3 ${form.modelo_cobranca_padrao === 'por_sessao' ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
                        {form.modelo_cobranca_padrao === 'por_sessao' && <Check size={12} color="#FFF" />}
                    </View>
                    <Text className={`font-cori-medium text-base ${form.modelo_cobranca_padrao === 'por_sessao' ? 'text-emerald-800' : 'text-slate-600'}`}>Por Sessão (Avulso)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => updateForm('modelo_cobranca_padrao', 'pacote_mensal')}
                    className={`flex-row items-center p-4 rounded-2xl border ${form.modelo_cobranca_padrao === 'pacote_mensal' ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-200'}`}
                >
                    <View className={`w-5 h-5 rounded-full border items-center justify-center mr-3 ${form.modelo_cobranca_padrao === 'pacote_mensal' ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
                        {form.modelo_cobranca_padrao === 'pacote_mensal' && <Check size={12} color="#FFF" />}
                    </View>
                    <Text className={`font-cori-medium text-base ${form.modelo_cobranca_padrao === 'pacote_mensal' ? 'text-emerald-800' : 'text-slate-600'}`}>Pacote Mensal</Text>
                </TouchableOpacity>
            </View>

            <View className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-6">
                <Text className="font-cori-medium text-slate-700 mb-3">Qual o valor base da sua sessão?</Text>
                <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                    <Text className="font-cori-medium text-slate-400 mr-2 text-lg">R$</Text>
                    <TextInput
                        className="flex-1 text-lg font-cori text-slate-800 border-l border-slate-200 pl-3"
                        placeholder="0,00"
                        placeholderTextColor="#9ca3af"
                        keyboardType="numeric"
                        value={form.valor_sessao_padrao}
                        onChangeText={(t) => updateForm('valor_sessao_padrao', t)}
                    />
                </View>
            </View>

            <View className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <Text className="font-cori-medium text-slate-700 mb-3">Política para faltas não avisadas</Text>

                <TouchableOpacity
                    onPress={() => updateForm('cobrar_faltas_nao_avisadas', true)}
                    className={`flex-row items-center p-4 rounded-2xl border mb-3 ${form.cobrar_faltas_nao_avisadas ? 'bg-red-50 border-red-300' : 'bg-white border-slate-200'}`}
                >
                    <View className={`w-5 h-5 rounded-full border items-center justify-center mr-3 ${form.cobrar_faltas_nao_avisadas ? 'border-red-500 bg-red-500' : 'border-slate-300'}`}>
                        {form.cobrar_faltas_nao_avisadas && <Check size={12} color="#FFF" />}
                    </View>
                    <Text className={`font-cori-medium text-base flex-1 ${form.cobrar_faltas_nao_avisadas ? 'text-red-800' : 'text-slate-600'}`}>Cobro a sessão normalmente</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => updateForm('cobrar_faltas_nao_avisadas', false)}
                    className={`flex-row items-center p-4 rounded-2xl border ${!form.cobrar_faltas_nao_avisadas ? 'bg-slate-100 border-slate-300' : 'bg-white border-slate-200'}`}
                >
                    <View className={`w-5 h-5 rounded-full border items-center justify-center mr-3 ${!form.cobrar_faltas_nao_avisadas ? 'border-slate-500 bg-slate-500' : 'border-slate-300'}`}>
                        {!form.cobrar_faltas_nao_avisadas && <Check size={12} color="#FFF" />}
                    </View>
                    <Text className={`font-cori-medium text-base flex-1 ${!form.cobrar_faltas_nao_avisadas ? 'text-slate-800' : 'text-slate-600'}`}>Não cobro</Text>
                </TouchableOpacity>
            </View>

        </View>
    );

    const canGoNext = () => {
        if (currentStep === 0) return isStep1Valid;
        if (currentStep === 1) return isStep2Valid;
        return true;
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: '#FAF9F6' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* Progress Bar Topo */}
            <View className="pt-16 pb-2 px-6">
                <View className="flex-row items-center justify-between mb-4">
                    <Text className="font-cori-bold text-slate-400 text-sm tracking-widest uppercase">
                        Passo {currentStep + 1} de 3
                    </Text>
                    <View className="bg-slate-200 rounded-full px-3 py-1">
                        <Text className="font-cori-medium text-slate-500 text-xs text-center">Configuração Mínima</Text>
                    </View>
                </View>
                <View className="h-1.5 bg-slate-200 rounded-full overflow-hidden flex-row">
                    <View
                        style={{ width: `${((currentStep + 1) / 3) * 100}%` }}
                        className="h-full bg-slate-800 rounded-full transition-all duration-300"
                    />
                </View>
            </View>

            <FlatList
                ref={flatListRef}
                data={['slide1', 'slide2', 'slide3']}
                keyExtractor={(item) => item}
                horizontal
                pagingEnabled
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
                className="flex-1"
                renderItem={({ index }) => {
                    if (index === 0) return renderSlide1();
                    if (index === 1) return renderSlide2();
                    if (index === 2) return renderSlide3();
                    return null;
                }}
            />

            {/* Bottom Controls */}
            <View className={`px-6 pt-4 pb-10 bg-[#FAF9F6] border-t border-slate-100 flex-row ${currentStep > 0 ? 'justify-between' : 'justify-end'} items-center`}>

                {currentStep > 0 && (
                    <TouchableOpacity
                        onPress={handleBack}
                        disabled={isSubmitting}
                        className="flex-row items-center p-4 bg-white border border-slate-200 rounded-2xl shadow-sm"
                    >
                        <ChevronLeft size={24} color="#64748b" />
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    onPress={handleNext}
                    disabled={!canGoNext() || isSubmitting}
                    className={`flex-row items-center px-8 py-5 rounded-2xl ${canGoNext() ? 'bg-slate-800 shadow-lg shadow-slate-900/20' : 'bg-slate-300'} flex-1 ${currentStep > 0 ? 'ml-4' : ''} justify-center`}
                >
                    {isSubmitting ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <>
                            <Text className="font-cori-bold text-white text-lg mr-2">
                                {currentStep === 2 ? 'Finalizar e Entrar' : 'Continuar'}
                            </Text>
                            {currentStep < 2 && <ChevronRight size={20} color="#FFF" />}
                            {currentStep === 2 && <Check size={20} color="#FFF" />}
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}
