import { Stack } from 'expo-router';
import React from 'react';

export default function PacientesLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false, // O cabeçalho verde padrão da tab ou custom header em cada tela
            }}
        >
            <Stack.Screen name="index" />
            <Stack.Screen name="[id]" />
        </Stack>
    );
}
