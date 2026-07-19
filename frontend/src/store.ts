import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 全局 UI / 图表显示语言 */
export type AppLanguage = 'zh' | 'zh-TW' | 'en' | 'ja';

interface AppState {
  theme: 'dark' | 'light';
  language: AppLanguage;
  toggleTheme: () => void;
  setLanguage: (lang: AppLanguage) => void;
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

/** 映射到 i18next 资源键（四语言 UI 文案已全量提供） */
export function toI18nLng(lang: AppLanguage): 'zh' | 'zh-TW' | 'en' | 'ja' {
  return lang;
}

/** 映射到图表 / Markdown displayLang */
export function toDisplayLang(lang: AppLanguage): string {
  switch (lang) {
    case 'zh-TW':
      return '繁體中文';
    case 'en':
      return 'English';
    case 'ja':
      return '日本語';
    default:
      return '简体中文';
  }
}
