import { useLocalSearchParams } from 'expo-router';
import { CalendarCheck, CheckCircle2, XCircle } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiPublic } from '../../services/apiPublic';

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function ConfirmacaoScreen() {
    const { token } = useLocalSearchParams<{ token: string }>();
    const [status, setStatus] = useState<Status>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const handleConfirmar = async () => {
        if (!token) return;
        setStatus('loading');
        try {
            await apiPublic.patch(`/sessoes/public/confirmar/${token}`);
            setStatus('success');
        } catch (error: any) {
            setStatus('error');
            if (error.response?.status === 422) {
                setErrorMessage('Esta sessão já foi confirmada ou cancelada anteriormente.');
            } else if (error.response?.status === 404) {
                setErrorMessage('Link de confirmação inválido ou expirado.');
            } else {
                setErrorMessage('Ocorreu um erro ao confirmar. Tente novamente mais tarde.');
            }
        }
    };

    if (!token) {
        return (
            <View style={styles.container}>
                <View style={styles.card}>
                    <XCircle color="#E74C3C" size={64} style={styles.icon} />
                    <Text style={styles.titleError}>Link Inválido</Text>
                    <Text style={styles.subtitle}>O token de confirmação não foi fornecido na URL.</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.card}>

                {status === 'idle' && (
                    <>
                        <View style={styles.iconCircle}>
                            <CalendarCheck color="#2C3E50" size={40} />
                        </View>
                        <Text style={styles.title}>Confirmação de Sessão</Text>
                        <Text style={styles.subtitle}>
                            Seu psicólogo solicitou a confirmação da sua próxima sessão agendada.
                        </Text>

                        <TouchableOpacity style={styles.button} onPress={handleConfirmar}>
                            <Text style={styles.buttonText}>Confirmar Presença</Text>
                        </TouchableOpacity>
                    </>
                )}

                {status === 'loading' && (
                    <View style={styles.feedbackContainer}>
                        <ActivityIndicator size="large" color="#2C3E50" />
                        <Text style={styles.feedbackText}>Processando confirmação...</Text>
                    </View>
                )}

                {status === 'success' && (
                    <View style={styles.feedbackContainer}>
                        <CheckCircle2 color="#27AE60" size={64} style={styles.icon} />
                        <Text style={styles.titleSuccess}>Presença Confirmada!</Text>
                        <Text style={styles.subtitle}>
                            Tudo certo! Seu psicólogo já foi notificado. Esperamos você na sessão.
                        </Text>
                    </View>
                )}

                {status === 'error' && (
                    <View style={styles.feedbackContainer}>
                        <XCircle color="#E74C3C" size={64} style={styles.icon} />
                        <Text style={styles.titleError}>Não foi possível confirmar</Text>
                        <Text style={styles.subtitle}>{errorMessage}</Text>

                        <TouchableOpacity
                            style={styles.retryButton}
                            onPress={() => setStatus('idle')}
                        >
                            <Text style={styles.retryButtonText}>Tentar Novamente</Text>
                        </TouchableOpacity>
                    </View>
                )}

            </View>

            <Text style={styles.brandText}>Powered by Cori - Seu consultório inteligente</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F4F6F8', // Subtle web gray
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        backgroundColor: '#FFFFFF',
        width: '100%',
        maxWidth: 400, // Important for desktop web feel
        borderRadius: 24,
        padding: 40,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 24,
        elevation: 5,
        borderWidth: 1,
        borderColor: '#EFEFEF',
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#F9FBF9',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#EAECEE',
    },
    icon: {
        marginBottom: 24,
    },
    title: {
        fontFamily: 'Cori-Bold',
        fontSize: 24,
        color: '#2C3E50',
        marginBottom: 12,
        textAlign: 'center',
    },
    titleSuccess: {
        fontFamily: 'Cori-Bold',
        fontSize: 24,
        color: '#27AE60',
        marginBottom: 12,
        textAlign: 'center',
    },
    titleError: {
        fontFamily: 'Cori-Bold',
        fontSize: 24,
        color: '#E74C3C',
        marginBottom: 12,
        textAlign: 'center',
    },
    subtitle: {
        fontFamily: 'Cori',
        fontSize: 16,
        color: '#7F8C8D',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 32,
    },
    button: {
        backgroundColor: '#2C3E50',
        width: '100%',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#2C3E50',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#FFFFFF',
    },
    retryButton: {
        backgroundColor: '#FDF2F1',
        width: '100%',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FADBD8',
    },
    retryButtonText: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#E74C3C',
    },
    feedbackContainer: {
        alignItems: 'center',
        width: '100%',
    },
    feedbackText: {
        fontFamily: 'Cori-Medium',
        fontSize: 16,
        color: '#2C3E50',
        marginTop: 16,
    },
    brandText: {
        fontFamily: 'Cori-Medium',
        fontSize: 12,
        color: '#BDC3C7',
        marginTop: 32,
    }
});
