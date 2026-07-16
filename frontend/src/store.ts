import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  theme: 'dark' | 'light';
  language: 'zh' | 'en';
  toggleTheme: () => void;
  setLanguage: (lang: 'zh' | 'en') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      language: 'zh',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      setLanguage: (lang) => set({ language: lang }),
    }),
    {
      name: 'sidea-app-storage',
    }
  )
);
