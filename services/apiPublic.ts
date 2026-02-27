import axios from 'axios';
import { Platform } from 'react-native';

// Use same base URL logic as the main api.ts
const devCoriURL = 'http://localhost:8000';
const androidLocalURL = 'http://10.0.2.2:8000';
const iOSLocalURL = 'http://127.0.0.1:8000';

const baseURL = __DEV__
    ? Platform.OS === 'android' ? androidLocalURL : iOSLocalURL
    : 'https://api.cori.app';

export const apiPublic = axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    timeout: 15000,
});
