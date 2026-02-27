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

    // DEV BYPASS CONFIGURATION
    const __DEV_MODE__ = true;

    // Configure Google Auth Request
    // TODO: Em produção, você deverá configurar as client IDs reais (iOS, Android, Web) no Google Cloud Console
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
            // 1. Enviar o id_token para nossa API backend
            const res = await api.post('/auth/google', { id_token: idToken });

            // 2. Extrair o access_token (JWT próprio da plataforma Cori)
            const { access_token } = res.data;

            // 3. Salvar no SecureStore, atualizar o axios e popular o estado global
            await login(access_token);

            // Quando global.login termina, o roteador condicional no _layout.tsx será acionado automaticamente 
            // removendo a AuthStack e renderizando a AppStack. Nenhuma navegação explícita é necessária aqui.
        } catch (error) {
            console.error('Falha no login com backend:', error);
            Alert.alert('Erro', 'Não foi possível completar o login nos servidores Cori. Tente novamente mais tarde.');
            setIsAuthenticating(false);
        }
    };

    const handleDevBypass = async () => {
        setIsAuthenticating(true);
        try {
            await login('mock_dev_token_123');
        } catch (error) {
            Alert.alert("Erro", "Falha no modo Dev Bypass.");
            setIsAuthenticating(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.brandContainer}>
                <Text style={styles.title}>Cori</Text>
                <Text style={styles.subtitle}>Gestão Inteligente para Psicólogos</Text>
            </View>

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
                            {/* Espaço para o ícone do Google. Usando texto G provisional. */}
                            <View style={styles.googleIconPlaceholder}>
                                <Text style={styles.gText}>G</Text>
                            </View>
                            <Text style={styles.googleButtonText}>Entrar com Google</Text>
                        </>
                    )}
                </TouchableOpacity>

                {__DEV_MODE__ && (
                    <TouchableOpacity
                        style={styles.devButton}
                        onPress={handleDevBypass}
                        disabled={isAuthenticating}
                    >
                        <Text style={styles.devButtonText}>Entrar no Modo Dev (Bypass)</Text>
                    </TouchableOpacity>
                )}
            </View>
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
    devButton: {
        marginTop: 24,
        padding: 8,
    },
    devButtonText: {
        fontFamily: 'Cori-Medium',
        fontSize: 14,
        color: '#BDC3C7',
        textDecorationLine: 'underline',
    }
});
