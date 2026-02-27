import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CheckCircle2, Clock, FileText, Share2, User, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { api } from '../../services/api';
import { AnotacaoResponse, SessaoResponse } from '../../types/api';

interface Props {
    visible: boolean;
    sessao: SessaoResponse | null;
    onClose: () => void;
    onStatusChange: (updatedSessao: SessaoResponse) => void;
    onShare?: (sessao: SessaoResponse) => void;
}

export default function SessaoDetalhesModal({ visible, sessao, onClose, onStatusChange, onShare }: Props) {
    const [estadoLocal, setEstadoLocal] = useState<SessaoResponse['estado'] | null>(null);
    const [loadingStatus, setLoadingStatus] = useState(false);

    // Notes state
    const [anotacao, setAnotacao] = useState('');
    const [loadingAnotacao, setLoadingAnotacao] = useState(false);
    const [savingAnotacao, setSavingAnotacao] = useState(false);

    // Reset when session changes
    useEffect(() => {
        if (sessao && visible) {
            setEstadoLocal(sessao.estado);
            if (sessao.estado === 'realizada') {
                fetchAnotacao(sessao.id);
            } else {
                setAnotacao('');
            }
        }
    }, [sessao, visible]);

    const fetchAnotacao = async (sessaoId: number) => {
        setLoadingAnotacao(true);
        try {
            const response = await api.get<AnotacaoResponse>(`/anotacoes/sessao/${sessaoId}`);
            setAnotacao(response.data.conteudo);
        } catch (error: any) {
            if (error.response?.status === 404) {
                // Not found, normal.
                setAnotacao('');
            } else {
                console.error("Error fetching note:", error.message);
            }
        } finally {
            setLoadingAnotacao(false);
        }
    };

    const handleAtualizarEstado = async (novoEstado: SessaoResponse['estado']) => {
        if (!sessao || sessao.ja_faturada) return;
        if (novoEstado === estadoLocal) return;

        setLoadingStatus(true);
        try {
            const res = await api.patch<SessaoResponse>(`/sessoes/${sessao.id}/estado`, {
                estado: novoEstado
            });
            setEstadoLocal(novoEstado);
            onStatusChange(res.data);

            // Se virou realizada agora, tenta buscar anotação (caso houver alguma prévia)
            if (novoEstado === 'realizada') {
                fetchAnotacao(sessao.id);
            }

        } catch (err: any) {
            Alert.alert("Erro", "Não foi possível alterar o estado da sessão.");
            setEstadoLocal(sessao.estado); // rollback
        } finally {
            setLoadingStatus(false);
        }
    };

    const handleSalvarProntuario = async () => {
        if (!sessao || !anotacao.trim()) return;

        setSavingAnotacao(true);
        try {
            await api.post('/anotacoes/', {
                sessao_id: sessao.id,
                conteudo: anotacao.trim(),
                tipo: 'evolucao_oficial'
            });
            Alert.alert("Sucesso", "Prontuário salvo com sucesso!");
        } catch (err: any) {
            Alert.alert("Erro", "Falha ao salvar a evolução.");
        } finally {
            setSavingAnotacao(false);
        }
    };

    if (!sessao) return null;

    const locked = sessao.ja_faturada;

    // Status visual configuration
    const STATUS_OPTIONS: { value: SessaoResponse['estado'], label: string, color: string }[] = [
        { value: 'agendada', label: 'Agendada', color: '#3498DB' },
        { value: 'confirmada', label: 'Confirmada', color: '#9B59B6' },
        { value: 'realizada', label: 'Realizada (Check-in)', color: '#27AE60' },
        { value: 'falta_cobrada', label: 'Faltou (Cobrar)', color: '#F39C12' },
        { value: 'cancelada_paciente', label: 'Cancelou (Isento)', color: '#E74C3C' },
        { value: 'remarcada', label: 'Remarcada', color: '#A0AAB5' },
    ];

    const dataInicio = new Date(sessao.data_hora_inicio);
    const dataFim = new Date(sessao.data_hora_fim);
    const dayName = format(dataInicio, 'EEEE', { locale: ptBR });

    const pacienteNome = sessao.paciente?.nome_completo || "Paciente Selecionado";

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

                        {/* HEADER */}
                        <View style={styles.header}>
                            <View>
                                <Text style={styles.headerTitle}>Status da Sessão</Text>
                                <Text style={styles.headerSubtitle}>
                                    {format(dataInicio, "dd 'de' MMM, yyyy", { locale: ptBR })}
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                {(sessao.estado === 'agendada' || sessao.estado === 'confirmada') && onShare && (
                                    <TouchableOpacity
                                        style={[styles.closeBtn, { backgroundColor: '#E8F5E9' }]}
                                        onPress={() => onShare(sessao)}
                                    >
                                        <Share2 color="#27AE60" size={22} />
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                    <X color="#7F8C8D" size={24} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

                            {/* Sessao Info Banner */}
                            <View style={styles.infoBanner}>
                                <View style={styles.infoRow}>
                                    <User color="#2C3E50" size={18} style={styles.infoIcon} />
                                    <Text style={styles.infoTextPrimary} numberOfLines={1}>{pacienteNome}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Clock color="#7F8C8D" size={16} style={styles.infoIcon} />
                                    <Text style={styles.infoTextSecondary}>
                                        {format(dataInicio, "HH:mm")} às {format(dataFim, "HH:mm")}
                                    </Text>
                                </View>
                            </View>

                            {/* LOCKED ALERT */}
                            {locked && (
                                <View style={styles.lockedAlert}>
                                    <AlertTriangle color="#E67E22" size={20} style={{ marginRight: 8 }} />
                                    <Text style={styles.lockedAlertText}>
                                        Esta sessão já consta numa fatura. Não é possível alterar o estado financeiro dela.
                                    </Text>
                                </View>
                            )}

                            {/* STATUS SELECTOR */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>1. Check-in (Estado)</Text>
                                <View style={styles.statusGrid}>
                                    {STATUS_OPTIONS.map((opt) => {
                                        const isSelected = estadoLocal === opt.value;
                                        return (
                                            <TouchableOpacity
                                                key={opt.value}
                                                style={[
                                                    styles.statusBtn,
                                                    isSelected && { borderColor: opt.color, backgroundColor: `${opt.color}15` },
                                                    locked && !isSelected && styles.statusBtnDisabled
                                                ]}
                                                onPress={() => handleAtualizarEstado(opt.value)}
                                                disabled={locked || loadingStatus}
                                            >
                                                {isSelected && <CheckCircle2 color={opt.color} size={16} style={{ marginRight: 6 }} />}
                                                <Text style={[
                                                    styles.statusBtnText,
                                                    isSelected && { color: opt.color, fontFamily: 'Cori-Bold' },
                                                    locked && !isSelected && styles.statusTextDisabled
                                                ]}>
                                                    {opt.label}
                                                </Text>
                                            </TouchableOpacity>
                                        )
                                    })}
                                </View>
                            </View>

                            {/* ANOTAÇÃO CONDICIONAL */}
                            {estadoLocal === 'realizada' && (
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>2. Prontuário Clínico (Evolução)</Text>
                                    <Text style={styles.sectionSubtitle}>
                                        Esta anotação é oficial e visível apenas para você.
                                    </Text>

                                    <View style={styles.editorContainer}>
                                        {loadingAnotacao ? (
                                            <ActivityIndicator color="#2C3E50" style={{ padding: 40 }} />
                                        ) : (
                                            <TextInput
                                                style={styles.editorInput}
                                                placeholder="Como foi a sessão hoje? Digite aqui a evolução do paciente..."
                                                placeholderTextColor="#A0AAB5"
                                                multiline
                                                textAlignVertical="top"
                                                value={anotacao}
                                                onChangeText={setAnotacao}
                                            />
                                        )}
                                    </View>

                                    <TouchableOpacity
                                        style={[styles.saveBtn, (!anotacao.trim() || savingAnotacao) && styles.saveBtnDisabled]}
                                        onPress={handleSalvarProntuario}
                                        disabled={!anotacao.trim() || savingAnotacao || loadingAnotacao}
                                    >
                                        {savingAnotacao ? (
                                            <ActivityIndicator color="#FFFFFF" size="small" />
                                        ) : (
                                            <>
                                                <FileText color="#FFFFFF" size={18} style={{ marginRight: 8 }} />
                                                <Text style={styles.saveBtnText}>Guardar Prontuário</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}

                        </ScrollView>
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
        height: '92%', // Fills most of the screen
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
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
        paddingBottom: 80,
    },
    infoBanner: {
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#EFEFEF',
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    infoIcon: {
        marginRight: 8,
    },
    infoTextPrimary: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#2C3E50',
        flex: 1,
    },
    infoTextSecondary: {
        fontFamily: 'Cori-Medium',
        fontSize: 14,
        color: '#7F8C8D',
    },
    lockedAlert: {
        flexDirection: 'row',
        backgroundColor: '#FFF3E0',
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
        alignItems: 'center',
    },
    lockedAlertText: {
        flex: 1,
        fontFamily: 'Cori-SemiBold',
        fontSize: 13,
        color: '#D35400',
        lineHeight: 18,
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#2C3E50',
        marginBottom: 8,
    },
    sectionSubtitle: {
        fontFamily: 'Cori',
        fontSize: 14,
        color: '#7F8C8D',
        marginBottom: 16,
    },
    statusGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    statusBtn: {
        width: '48%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5,
        borderColor: '#EFEFEF',
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 8,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 4,
        elevation: 1,
    },
    statusBtnDisabled: {
        backgroundColor: '#F9FBF9',
        borderColor: '#F0F0F0',
        shadowOpacity: 0,
        elevation: 0,
    },
    statusBtnText: {
        fontFamily: 'Cori-Medium',
        fontSize: 13,
        color: '#34495E',
        textAlign: 'center',
    },
    statusTextDisabled: {
        color: '#BDC3C7',
    },
    editorContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#EFEFEF',
        minHeight: 250,
        marginBottom: 16,
    },
    editorInput: {
        flex: 1,
        padding: 16,
        paddingTop: 16,
        fontFamily: 'Cori-Medium',
        fontSize: 15,
        color: '#2C3E50',
        lineHeight: 22,
    },
    saveBtn: {
        flexDirection: 'row',
        backgroundColor: '#2C3E50',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#2C3E50',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    saveBtnDisabled: {
        backgroundColor: '#A0AAB5',
        shadowOpacity: 0,
        elevation: 0,
    },
    saveBtnText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#FFFFFF',
    }
});
