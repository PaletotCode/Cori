import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const getBaseUrl = () => {
    if (process.env.EXPO_PUBLIC_API_URL) {
        return process.env.EXPO_PUBLIC_API_URL;
    }

    // Auto-detect LAN IP from Expo dev server if running via Expo Go / Local Network
    const debuggerHost = Constants.expoConfig?.hostUri;
    if (debuggerHost) {
        // e.g. "192.168.1.15:8081" -> "192.168.1.15"
        const ip = debuggerHost.split(':')[0];
        return `http://${ip}:8000`;
    }

    // Local development fallback
    // Android emulator runs on 10.0.2.2 usually mapping to host localhost
    if (Platform.OS === 'android') {
        return 'http://10.0.2.2:8000';
    }
    return 'http://localhost:8000';
};

export const api = axios.create({
    baseURL: getBaseUrl(),
});

// Request Interceptor
api.interceptors.request.use(
    async (config) => {
        const token = await SecureStore.getItemAsync('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response Interceptor
api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        if (error.response && error.response.status === 401) {
            // Lazy load to avoid circular dependency problems on boot
            const { useAuthStore } = require('../store/authStore');
            useAuthStore.getState().logout();
        }
        return Promise.reject(error);
    }
);
