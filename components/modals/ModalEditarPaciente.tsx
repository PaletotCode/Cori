import { Trash2, UserCog } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { PacienteResponse } from '../../types/api';
import BottomSheetModalCustom from './BottomSheetModalCustom';

interface ModalEditarPacienteProps {
    visible: boolean;
    onClose: () => void;
    paciente: PacienteResponse | null;
    onSuccess: () => void;
    onDeleted: () => void;
}

export default function ModalEditarPaciente({ visible, onClose, paciente, onSuccess, onDeleted }: ModalEditarPacienteProps) {
    const [nome_completo, setNomeCompleto] = useState('');
    const [descricao_clinica, setDescricaoClinica] = useState('');
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (visible && paciente) {
            setNomeCompleto(paciente.nome_completo);
            setDescricaoClinica(paciente.descricao_clinica || '');
        }
    }, [visible, paciente]);

    const handleSalvar = async () => {
        if (!paciente || !nome_completo.trim()) {
            Alert.alert("Aviso", "O nome do paciente não pode ficar vazio.");
            return;
        }

        setLoading(true);
        try {
            await api.patch(`/pacientes/${paciente.id}`, {
                nome_completo: nome_completo.trim(),
                descricao_clinica: descricao_clinica.trim() || undefined
            });
            Alert.alert("Sucesso", "Dados atualizados com sucesso.");
            onSuccess();
            onClose();
        } catch (error) {
            console.error(error);
            Alert.alert("Erro", "Falha ao atualizar paciente.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeletar = () => {
        if (!paciente) return;

        Alert.alert(
            "Excluir Paciente",
            "Esta ação é irreversível. Todas as sessões, faturas e anotações deste paciente serão apagadas para sempre. Tem certeza?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sim, Excluir",
                    style: "destructive",
                    onPress: async () => {
                        setDeleting(true);
                        try {
                            await api.delete(`/pacientes/${paciente.id}`);
                            Alert.alert("Sucesso", "Paciente excluído.");
                            onDeleted();
                            onClose();
                        } catch (error) {
                            console.error(error);
                            Alert.alert("Erro", "Não foi possível excluir o paciente.");
                        } finally {
                            setDeleting(false);
                        }
                    }
                }
            ]
        );
    };

    if (!paciente) return null;

    return (
        <BottomSheetModalCustom visible={visible} onClose={onClose}>
            <ScrollView style={styles.contentContainer} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <View style={styles.iconContainer}>
                        <UserCog color="#34495E" size={28} />
                    </View>
                    <Text style={styles.title}>Configurações do Paciente</Text>
                    <Text style={styles.infoText}>Edite os dados principais ou exclua o registro permanentemente.</Text>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Nome Completo</Text>
                    <TextInput
                        style={styles.input}
                        value={nome_completo}
                        onChangeText={setNomeCompleto}
                        placeholder="Nome do paciente"
                    />
                </View>

                <View style={[styles.inputGroup, { marginBottom: 32 }]}>
                    <Text style={styles.label}>Descrição / Queixa</Text>
                    <TextInput
                        style={styles.textArea}
                        value={descricao_clinica}
                        onChangeText={setDescricaoClinica}
                        placeholder="Motivo da terapia..."
                        multiline
                        textAlignVertical="top"
                    />
                </View>

                <TouchableOpacity
                    style={[styles.btnAction, loading && styles.btnDisabled]}
                    onPress={handleSalvar}
                    disabled={loading || deleting}
                >
                    <Text style={styles.btnActionText}>
                        {loading ? 'Salvando...' : 'Salvar Alterações'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.btnDanger, deleting && styles.btnDisabled]}
                    onPress={handleDeletar}
                    disabled={loading || deleting}
                >
                    <Trash2 color="#E74C3C" size={20} />
                    <Text style={styles.btnDangerText}>
                        {deleting ? 'Excluindo...' : 'Excluir Paciente'}
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
        backgroundColor: '#F4F6F8',
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
    inputGroup: {
        marginBottom: 16,
    },
    label: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 14,
        color: '#34495E',
        marginBottom: 8,
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
        marginBottom: 16,
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
    },
    btnDanger: {
        flexDirection: 'row',
        backgroundColor: '#FDF2F1',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#FADBD8',
    },
    btnDangerText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#E74C3C',
        marginLeft: 12,
    }
});
