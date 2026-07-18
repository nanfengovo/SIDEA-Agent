export const getBaseUrl = () => localStorage.getItem('SIDEA_SERVER_URL') || import.meta.env.VITE_BASE_URL || 'http://localhost:8000';
export const getApiUrl = () => `${getBaseUrl()}/api`;
