import { create } from 'zustand';

export interface PsychologistTenant {
    tenant_id: string;
    name: string;
    email: string;
    crp: string; // Brazilian psychologist registry standard
}

interface AuthState {
    tenant: PsychologistTenant | null;
    isAuthenticated: boolean;
    login: (tenant: PsychologistTenant) => void;
    logout: () => void;
}

// Emulating a logged-in psychologist session for MVP (Mother Beta Tester)
const MOCK_CURRENT_PSYCHOLOGIST: PsychologistTenant = {
    tenant_id: 'tenant_mock_beta_zero',
    name: 'Beta Tester',
    email: 'beta@coriapp.com',
    crp: '00/00000',
};

export const useAuthStore = create<AuthState>((set) => ({
    tenant: MOCK_CURRENT_PSYCHOLOGIST,
    isAuthenticated: true,
    login: (tenant) => set({ tenant, isAuthenticated: true }),
    logout: () => set({ tenant: null, isAuthenticated: false }),
}));
