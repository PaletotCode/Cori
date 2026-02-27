import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function FinanceiroScreen() {
    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <View style={styles.header}>
                <Text style={styles.title}>Financeiro</Text>
            </View>

            <View style={styles.content}>
                <Text style={styles.placeholder}>Controle financeiro em breve...</Text>
            </View>
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
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        height: 80,
    },
    title: {
        fontFamily: 'Cori-Bold',
        fontSize: 32,
        color: '#2C3E50',
        letterSpacing: -0.5,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholder: {
        fontFamily: 'Cori',
        color: '#A0AAB5',
        fontSize: 16,
    }
});
