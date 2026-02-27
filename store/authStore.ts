import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { api } from '../services/api';
import { Psicologo } from '../types/api';

interface AuthState {
    psicologo: Psicologo | null;
    isLoading: boolean;
    login: (token: string) => Promise<void>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
    psicologo: null,
    isLoading: true, // Começa carregando para a tela de splash não piscar

    login: async (token: string) => {
        try {
            await SecureStore.setItemAsync('access_token', token);

            // O interceptor do axios fará o trabalho de injetar o token agora,
            // independentemente se for o mock token ou o token real do Google.
            const response = await api.get<Psicologo>('/auth/me');
            set({ psicologo: response.data, isLoading: false });
        } catch (error) {
            await SecureStore.deleteItemAsync('access_token');
            set({ psicologo: null, isLoading: false });
            throw error;
        }
    },

    logout: async () => {
        await SecureStore.deleteItemAsync('access_token');
        set({ psicologo: null, isLoading: false });
    },

    checkAuth: async () => {
        set({ isLoading: true });
        try {
            const token = await SecureStore.getItemAsync('access_token');
            if (!token) {
                set({ psicologo: null, isLoading: false });
                return;
            }

            const response = await api.get<Psicologo>('/auth/me');
            set({ psicologo: response.data, isLoading: false });
        } catch (error) {
            // Em caso de 401, o interceptor também avisará, mas limpamos aqui garantidamente
            await SecureStore.deleteItemAsync('access_token');
            set({ psicologo: null, isLoading: false });
        }
    },
}));
