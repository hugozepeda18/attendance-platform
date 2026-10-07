import axios from 'axios';
import { getToken, clearToken } from './session';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Expired/revoked credentials: drop the token and return to sign-in.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && getToken()) {
      clearToken();
      window.location.reload();
    }
    return Promise.reject(err);
  },
);

export default api;
