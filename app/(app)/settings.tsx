import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { ArrowLeft, Link as LinkIcon, LogOut, User } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

export default function SettingsScreen() {
    const router = useRouter();
    const { psicologo, logout, checkAuth } = useAuthStore();

    const [nome, setNome] = useState(psicologo?.nome_exibicao || '');
    const [saving, setSaving] = useState(false);

    const publicLink = `https://cori.app/triagem/${psicologo?.slug_link_publico}`;

    const handleCopyLink = async () => {
        await Clipboard.setStringAsync(publicLink);
        Alert.alert("Link copiado!", "Você já pode colar no seu WhatsApp ou Instagram.");
    };

    const handleSaveProfile = async () => {
        if (!nome.trim()) return;
        setSaving(true);
        try {
            await api.patch('/auth/me', { nome_exibicao: nome.trim() });
            await checkAuth(); // Atualiza o estado global
            Alert.alert("Sucesso", "Perfil atualizado! 🎉");
        } catch (error) {
            console.error(error);
            Alert.alert("Erro", "Não foi possível atualizar o perfil.");
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        Alert.alert(
            "Sair do aplicativo",
            "Tem certeza que deseja deslogar do Cori?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sair",
                    style: "destructive",
                    onPress: async () => {
                        await logout();
                        // AppLayout will automatically redirect to Login because the user is null.
                    }
                }
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft color="#2C3E50" size={24} />
                </TouchableOpacity>
                <Text style={styles.title}>Meu Consultório</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Link de Triagem */}
                <View style={styles.cardHighlight}>
                    <View style={styles.cardHighlightIcon}>
                        <LinkIcon color="#FFFFFF" size={24} />
                    </View>
                    <Text style={styles.highlightTitle}>Seu Link de Triagem</Text>
                    <Text style={styles.highlightSub}>
                        Envie este link para novos pacientes. Eles cairão direto na sua aba "Pacientes" já triados!
                    </Text>

                    <View style={styles.linkBox}>
                        <Text style={styles.linkText} numberOfLines={1}>{publicLink}</Text>
                        <TouchableOpacity style={styles.copyBtn} onPress={handleCopyLink}>
                            <Text style={styles.copyBtnText}>Copiar</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Dados da Conta */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Dados Visíveis</Text>

                    <Text style={styles.label}>Nome de Exibição</Text>
                    <View style={styles.inputWrapper}>
                        <User color="#A0AAB5" size={20} style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            value={nome}
                            onChangeText={setNome}
                            placeholder="Dra. Seunome"
                        />
                    </View>

                    <Text style={styles.label}>E-mail de Login</Text>
                    <View style={[styles.inputWrapper, styles.inputDisabled]}>
                        <TextInput
                            style={[styles.input, { color: '#7F8C8D' }]}
                            value={psicologo?.email || ''}
                            editable={false}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.btnSave, (!nome.trim() || nome === psicologo?.nome_exibicao) && styles.btnSaveDisabled]}
                        onPress={handleSaveProfile}
                        disabled={!nome.trim() || nome === psicologo?.nome_exibicao || saving}
                    >
                        {saving ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                            <Text style={styles.btnSaveText}>Salvar Alterações</Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Sistema */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Sistema</Text>

                    <TouchableOpacity style={styles.btnLogout} onPress={handleLogout}>
                        <LogOut color="#E74C3C" size={20} />
                        <Text style={styles.btnLogoutText}>Sair do Aplicativo</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAF9F6',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 24,
        backgroundColor: '#FAF9F6',
    },
    backBtn: {
        padding: 8,
        marginLeft: -8,
    },
    title: {
        fontFamily: 'Cori-Bold',
        fontSize: 20,
        color: '#2C3E50',
        flex: 1,
        textAlign: 'center',
    },
    content: {
        padding: 24,
        paddingBottom: 64,
    },
    // Highlight Card
    cardHighlight: {
        backgroundColor: '#2C3E50',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 32,
        shadowColor: '#2C3E50',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 6,
    },
    cardHighlightIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    highlightTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#FFFFFF',
        marginBottom: 8,
        textAlign: 'center',
    },
    highlightSub: {
        fontFamily: 'Cori',
        fontSize: 14,
        color: '#BDC3C7',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    linkBox: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        alignItems: 'center',
        width: '100%',
    },
    linkText: {
        flex: 1,
        fontFamily: 'Cori-Medium',
        fontSize: 14,
        color: '#3498DB',
        marginRight: 12,
    },
    copyBtn: {
        backgroundColor: 'rgba(52, 152, 219, 0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    copyBtnText: {
        fontFamily: 'Cori-Bold',
        fontSize: 12,
        color: '#3498DB',
    },
    // Form Section
    section: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 24,
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 12,
        elevation: 2,
    },
    sectionTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#2C3E50',
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
        marginBottom: 20,
    },
    inputDisabled: {
        backgroundColor: '#F0F2F5',
        borderColor: '#E8EAED',
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
    btnSave: {
        backgroundColor: '#27AE60',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },
    btnSaveDisabled: {
        backgroundColor: '#A0AAB5',
    },
    btnSaveText: {
        fontFamily: 'Cori-Bold',
        fontSize: 14,
        color: '#FFFFFF',
    },
    // Logout
    btnLogout: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: '#FDF2F2',
        borderWidth: 1,
        borderColor: '#FADBD8',
    },
    btnLogoutText: {
        fontFamily: 'Cori-Bold',
        fontSize: 14,
        color: '#E74C3C',
        marginLeft: 8,
    }
});
