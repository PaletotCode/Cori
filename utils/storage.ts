/**
 * utils/storage.ts
 *
 * Abstração de storage multiplataforma:
 *   - iOS / Android  → expo-secure-store (criptografado)
 *   - Web            → localStorage (apenas para desenvolvimento/testes)
 *
 * Nunca armazene dados sensíveis reais em localStorage em produção.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const storage = {
    getItem: async (key: string): Promise<string | null> => {
        if (Platform.OS === 'web') {
            return localStorage.getItem(key);
        }
        return SecureStore.getItemAsync(key);
    },

    setItem: async (key: string, value: string): Promise<void> => {
        if (Platform.OS === 'web') {
            localStorage.setItem(key, value);
            return;
        }
        await SecureStore.setItemAsync(key, value);
    },

    deleteItem: async (key: string): Promise<void> => {
        if (Platform.OS === 'web') {
            localStorage.removeItem(key);
            return;
        }
        await SecureStore.deleteItemAsync(key);
    },
};
