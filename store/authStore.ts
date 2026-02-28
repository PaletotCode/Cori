import { create } from 'zustand';
import { api } from '../services/api';
import { Psicologo } from '../types/api';
import { storage } from '../utils/storage';

interface AuthState {
    psicologo: Psicologo | null;
    isLoading: boolean;
    login: (token: string) => Promise<void>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
    devLoginNewUser: () => Promise<void>;
    devLoginEstablished: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
    psicologo: null,
    isLoading: true, // Começa carregando para a tela de splash não piscar

    login: async (token: string) => {
        try {
            await storage.setItem('access_token', token);

            // O interceptor do axios fará o trabalho de injetar o token agora,
            // independentemente se for o mock token ou o token real do Google.
            const response = await api.get<Psicologo>('/auth/me');
            set({ psicologo: response.data, isLoading: false });
        } catch (error) {
            await storage.deleteItem('access_token');
            set({ psicologo: null, isLoading: false });
            throw error;
        }
    },

    logout: async () => {
        await storage.deleteItem('access_token');
        set({ psicologo: null, isLoading: false });
    },

    checkAuth: async () => {
        set({ isLoading: true });
        try {
            const token = await storage.getItem('access_token');
            if (!token) {
                set({ psicologo: null, isLoading: false });
                return;
            }

            const response = await api.get<Psicologo>('/auth/me');
            set({ psicologo: response.data, isLoading: false });
        } catch (error) {
            // Em caso de 401, o interceptor também avisará, mas limpamos aqui garantidamente
            await storage.deleteItem('access_token');
            set({ psicologo: null, isLoading: false });
        }
    },

    // ==========================================
    // DEV BYPASS: Facilitadores para Desenvolvimento
    // ==========================================
    devLoginNewUser: async () => {
        set({
            isLoading: false,
            psicologo: {
                id: 9991,
                email: 'novo@cori.app',
                nome_exibicao: 'Dr. Novo Usuário',
                foto_perfil_url: null,
                slug_link_publico: 'novo-dr',
                dispositivo_push_token: null,
                onboarding_concluido: false,
                crp: null,
                duracao_sessao_padrao_minutos: 50,
                intervalo_sessao_padrao_minutos: 10,
                dias_atendimento: null,
                modelo_cobranca_padrao: 'por_sessao',
                valor_sessao_padrao: null,
                chave_pix: null,
                cobrar_faltas_nao_avisadas: false,
            }
        });
    },

    devLoginEstablished: async () => {
        set({
            isLoading: false,
            psicologo: {
                id: 9992,
                email: 'veterano@cori.app',
                nome_exibicao: 'Dra. Veterana',
                foto_perfil_url: null,
                slug_link_publico: 'vet-dra',
                dispositivo_push_token: null,
                onboarding_concluido: true,
                crp: '06/123456',
                duracao_sessao_padrao_minutos: 50,
                intervalo_sessao_padrao_minutos: 10,
                dias_atendimento: ['Seg', 'Ter', 'Qua'],
                modelo_cobranca_padrao: 'pacote_mensal_pos',
                valor_sessao_padrao: 150.0,
                chave_pix: 'pix@cori.app',
                cobrar_faltas_nao_avisadas: false,
            }
        });
    }
}));

