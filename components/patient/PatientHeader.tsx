import { useRouter } from 'expo-router';
import { ArrowLeft, BookOpen, DollarSign, MessageCircle, Phone, Settings2 } from 'lucide-react-native';
import React from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PacienteResponse } from '../../types/api';

interface Props {
    paciente: PacienteResponse;
    pacienteId: string | number;
    onEditPress: () => void;
    onAddSessao: () => void;
    onAddTarefa: () => void;
    onAddCheckin: () => void;
}

const getInitials = (name?: string) => {
    if (!name) return '??';
    return name.substring(0, 2).toUpperCase();
};

export default function PatientHeader({
    paciente,
    pacienteId,
    onEditPress,
    onAddSessao,
    onAddTarefa,
    onAddCheckin,
}: Props) {
    const router = useRouter();

    const handleWhatsApp = () => {
        const phone = paciente.meios_comunicacao?.whatsapp?.replace(/\D/g, '');
        if (phone) Linking.openURL(`whatsapp://send?phone=${phone}`);
    };

    const handleCall = () => {
        const phone = (paciente.meios_comunicacao?.emergencia || paciente.meios_comunicacao?.whatsapp)?.replace(/\D/g, '');
        if (phone) Linking.openURL(`tel:${phone}`);
    };

    const hasWhatsApp = !!paciente.meios_comunicacao?.whatsapp;
    const hasPhone = !!(paciente.meios_comunicacao?.emergencia || paciente.meios_comunicacao?.whatsapp);

    return (
        <View style={styles.container}>
            {/* Navbar */}
            <View style={styles.navBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.navBtn}>
                    <ArrowLeft color="#2C3E50" size={24} />
                </TouchableOpacity>
                <Text style={styles.navTitle}>Perfil do Paciente</Text>
                <TouchableOpacity style={styles.navBtn} onPress={onEditPress}>
                    <Settings2 color="#2C3E50" size={24} />
                </TouchableOpacity>
            </View>

            {/* Avatar + Info */}
            <View style={styles.profileRow}>
                {paciente.foto_perfil_url ? (
                    <Image source={{ uri: paciente.foto_perfil_url }} style={styles.avatar} />
                ) : (
                    <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>{getInitials(paciente.nome_completo)}</Text>
                    </View>
                )}
                <View style={styles.profileData}>
                    <Text style={styles.patientName}>{paciente.nome_completo}</Text>
                    <View style={styles.statsRow}>
                        {!!paciente.idade && (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>{paciente.idade} anos</Text>
                            </View>
                        )}
                        {!!paciente.tempo_atendimento_dias && (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>
                                    {(paciente.tempo_atendimento_dias / 30).toFixed(0)} meses
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>

            {/* Contact Actions */}
            <View style={styles.contactRow}>
                <TouchableOpacity
                    style={[styles.contactBtn, !hasWhatsApp && styles.contactBtnDisabled]}
                    onPress={handleWhatsApp}
                    disabled={!hasWhatsApp}
                >
                    <MessageCircle color={hasWhatsApp ? '#27AE60' : '#A0AAB5'} size={20} />
                    <Text style={[styles.contactBtnText, { color: hasWhatsApp ? '#27AE60' : '#A0AAB5' }]}>
                        WhatsApp
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.contactBtn, !hasPhone && styles.contactBtnDisabled]}
                    onPress={handleCall}
                    disabled={!hasPhone}
                >
                    <Phone color={hasPhone ? '#2C3E50' : '#A0AAB5'} size={20} />
                    <Text style={[styles.contactBtnText, { color: hasPhone ? '#2C3E50' : '#A0AAB5' }]}>Ligar</Text>
                </TouchableOpacity>
            </View>

            {/* Navigation CTAs */}
            <View style={styles.ctaRow}>
                <TouchableOpacity
                    style={[styles.ctaBtn, styles.ctaBtnGreen]}
                    onPress={() => router.push(`/pacientes/financeiro/${pacienteId}` as any)}
                >
                    <DollarSign color="#27AE60" size={18} />
                    <Text style={[styles.ctaBtnText, { color: '#27AE60' }]}>Financeiro</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.ctaBtn, styles.ctaBtnBlue]}
                    onPress={() => router.push(`/pacientes/anotacoes/${pacienteId}` as any)}
                >
                    <BookOpen color="#3498DB" size={18} />
                    <Text style={[styles.ctaBtnText, { color: '#3498DB' }]}>Anotações</Text>
                </TouchableOpacity>
            </View>

            {/* Timeline header + quick-add buttons */}
            <View style={styles.timelineHeader}>
                <View>
                    <Text style={styles.timelineTitle}>Linha do Tempo</Text>
                    <Text style={styles.timelineSubtitle}>Últimos 30 dias</Text>
                </View>
                <View style={styles.quickAddRow}>
                    <TouchableOpacity style={styles.addBtnSessao} onPress={onAddSessao}>
                        <Text style={styles.addBtnSessaoText}>+ Sessão</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.addBtnTarefa} onPress={onAddTarefa}>
                        <Text style={styles.addBtnTarefaText}>+ Tarefa</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.addBtnCheckin} onPress={onAddCheckin}>
                        <Text style={styles.addBtnCheckinText}>+ Humor</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#FAF9F6',
        paddingBottom: 8,
    },
    navBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    navBtn: {
        padding: 8,
        backgroundColor: '#EDF2F7',
        borderRadius: 20,
    },
    navTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#2C3E50',
    },
    profileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingBottom: 20,
        gap: 16,
    },
    avatar: {
        width: 72,
        height: 72,
        borderRadius: 36,
    },
    avatarPlaceholder: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#EDF2F7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontFamily: 'Cori-Bold',
        fontSize: 26,
        color: '#2C3E50',
    },
    profileData: {
        flex: 1,
    },
    patientName: {
        fontFamily: 'Cori-Bold',
        fontSize: 22,
        color: '#2C3E50',
        marginBottom: 8,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    badge: {
        backgroundColor: '#EDF2F7',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    badgeText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 13,
        color: '#2C3E50',
    },
    contactRow: {
        flexDirection: 'row',
        paddingHorizontal: 24,
        gap: 12,
        marginBottom: 12,
    },
    contactBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: '#EFEFEF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    contactBtnDisabled: {
        opacity: 0.4,
    },
    contactBtnText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 14,
    },
    ctaRow: {
        flexDirection: 'row',
        paddingHorizontal: 24,
        gap: 12,
        marginBottom: 20,
    },
    ctaBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 14,
        paddingVertical: 14,
        borderWidth: 1.5,
    },
    ctaBtnGreen: {
        backgroundColor: '#E8F5E9',
        borderColor: '#A5D6A7',
    },
    ctaBtnBlue: {
        backgroundColor: '#EBF5FB',
        borderColor: '#90CAF9',
    },
    ctaBtnText: {
        fontFamily: 'Cori-Bold',
        fontSize: 14,
    },
    timelineHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 16,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
    },
    timelineTitle: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#2C3E50',
        marginBottom: 2,
    },
    timelineSubtitle: {
        fontFamily: 'Cori-Medium',
        fontSize: 13,
        color: '#A0AAB5',
    },
    quickAddRow: {
        flexDirection: 'row',
        gap: 8,
    },
    addBtnSessao: {
        backgroundColor: '#2C3E50',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
    },
    addBtnSessaoText: {
        fontFamily: 'Cori-Bold',
        fontSize: 12,
        color: '#FFFFFF',
    },
    addBtnTarefa: {
        backgroundColor: '#E74C3C',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
    },
    addBtnTarefaText: {
        fontFamily: 'Cori-Bold',
        fontSize: 12,
        color: '#FFFFFF',
    },
    addBtnCheckin: {
        backgroundColor: '#3498DB',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
    },
    addBtnCheckinText: {
        fontFamily: 'Cori-Bold',
        fontSize: 12,
        color: '#FFFFFF',
    },
});
