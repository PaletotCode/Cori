import { X } from 'lucide-react-native';
import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

export default function BottomSheetModalCustom({ visible, onClose, children }: Props) {
    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <SafeAreaView style={styles.modalOverlay} edges={['top', 'bottom']}>
                <TouchableWithoutFeedback onPress={onClose}>
                    <View style={styles.backdrop} />
                </TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                    <View style={styles.dragHandleContainer}>
                        <View style={styles.dragHandle} />
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X color="#A0AAB5" size={24} />
                    </TouchableOpacity>
                    {children}
                </View>
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        minHeight: '40%',
        maxHeight: '90%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
    },
    dragHandleContainer: {
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 8,
    },
    dragHandle: {
        width: 48,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#EAECEE',
    },
    closeBtn: {
        position: 'absolute',
        top: 16,
        right: 24,
        zIndex: 10,
        padding: 4,
    }
});
