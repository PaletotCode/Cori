import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
    const { login } = useAuthStore();
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [selectedRole, setSelectedRole] = useState<'psicologo' | 'paciente' | null>(null);

    // DEV BYPASS CONFIGURATION
    const __DEV_MODE__ = true;

    // Configure Google Auth Request
    const [request, response, promptAsync] = Google.useAuthRequest({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'dummy_web_client_id.apps.googleusercontent.com',
        iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 'dummy_ios_client_id.apps.googleusercontent.com',
        androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || 'dummy_android_client_id.apps.googleusercontent.com',
    });

    useEffect(() => {
        if (response?.type === 'success') {
            const { authentication } = response;
            if (authentication?.idToken) {
                handleGoogleSignIn(authentication.idToken);
            } else {
                Alert.alert('Erro', 'Token de autenticação não recebido do Google.');
            }
        } else if (response?.type === 'error') {
            Alert.alert('Erro de Autenticação', response.error?.message || 'Falha ao autenticar com o Google.');
        }
    }, [response]);

    const handleGoogleSignIn = async (idToken: string) => {
        setIsAuthenticating(true);
        try {
            const res = await api.post('/auth/google', { id_token: idToken });
            const { access_token } = res.data;
            await login(access_token);
        } catch (error) {
            console.error('Falha no login com backend:', error);
            Alert.alert('Erro', 'Não foi possível completar o login nos servidores Cori. Tente novamente mais tarde.');
            setIsAuthenticating(false);
        }
    };

    const handleDevBypass = async (type: 'new' | 'established') => {
        setIsAuthenticating(true);
        try {
            if (type === 'new') {
                await useAuthStore.getState().devLoginNewUser();
            } else {
                await useAuthStore.getState().devLoginEstablished();
            }
        } catch (error) {
            Alert.alert("Erro", "Falha no modo Dev Bypass.");
            setIsAuthenticating(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.brandContainer}>
                <Text style={styles.title}>Cori</Text>
                <Text style={styles.subtitle}>Gestão Inteligente em Psicologia</Text>
            </View>

            {selectedRole === null ? (
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={styles.roleButton}
                        onPress={() => setSelectedRole('psicologo')}
                    >
                        <Text style={styles.roleButtonText}>Sou Psicólogo</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.roleButton, styles.roleButtonSecondary]}
                        onPress={() => Alert.alert("Em Breve", "O aplicativo para pacientes estará disponível em breve.")}
                    >
                        <Text style={[styles.roleButtonText, styles.roleButtonTextSecondary]}>Sou Paciente</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={styles.googleButton}
                        onPress={() => promptAsync()}
                        disabled={!request || isAuthenticating}
                    >
                        {isAuthenticating ? (
                            <ActivityIndicator color="#333" />
                        ) : (
                            <>
                                <View style={styles.googleIconPlaceholder}>
                                    <Text style={styles.gText}>G</Text>
                                </View>
                                <Text style={styles.googleButtonText}>Entrar com Google</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    {__DEV_MODE__ && (
                        <View style={styles.devOptionsContainer}>
                            <TouchableOpacity
                                style={styles.devButton}
                                onPress={() => handleDevBypass('new')}
                                disabled={isAuthenticating}
                            >
                                <Text style={styles.devButtonText}>Mock: Psicólogo (Novo/Onboarding)</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.devButton}
                                onPress={() => handleDevBypass('established')}
                                disabled={isAuthenticating}
                            >
                                <Text style={styles.devButtonText}>Mock: Psicólogo (Veterano/Pronto)</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => setSelectedRole(null)}
                        disabled={isAuthenticating}
                    >
                        <Text style={styles.backButtonText}>Voltar</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAF9F6', // Off-white base
        justifyContent: 'center',
        padding: 24,
    },
    brandContainer: {
        alignItems: 'center',
        marginBottom: 80,
    },
    title: {
        fontFamily: 'Cori-Bold',
        fontSize: 64,
        color: '#2C3E50',
        marginBottom: 8,
        letterSpacing: -1,
    },
    subtitle: {
        fontFamily: 'Cori',
        fontSize: 16,
        color: '#7F8C8D',
        textAlign: 'center',
    },
    buttonContainer: {
        width: '100%',
        alignItems: 'center',
    },
    roleButton: {
        backgroundColor: '#2C3E50',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 12,
        width: '100%',
        maxWidth: 320,
        alignItems: 'center',
        marginBottom: 16,
        shadowColor: '#2C3E50',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    roleButtonSecondary: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#BDC3C7',
        shadowOpacity: 0,
        elevation: 0,
    },
    roleButtonText: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#FFFFFF',
    },
    roleButtonTextSecondary: {
        color: '#7F8C8D',
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        width: '100%',
        maxWidth: 320,
        height: 56,
        marginBottom: 16,
    },
    googleIconPlaceholder: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#F1F1F1',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    gText: {
        fontFamily: 'Cori-Bold',
        fontSize: 14,
        color: '#4285F4', // Google Blue
    },
    googleButtonText: {
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#333333',
    },
    devOptionsContainer: {
        marginTop: 24,
        alignItems: 'center',
        backgroundColor: '#F8F9FA',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#EFEFEF',
        width: '100%',
        maxWidth: 320,
    },
    devButton: {
        paddingVertical: 8,
    },
    devButtonText: {
        fontFamily: 'Cori-Medium',
        fontSize: 14,
        color: '#95A5A6',
        textDecorationLine: 'underline',
    },
    backButton: {
        marginTop: 32,
        padding: 12,
    },
    backButtonText: {
        fontFamily: 'Cori-Medium',
        fontSize: 15,
        color: '#7F8C8D',
    }
});
