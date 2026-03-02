import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptBR from '@/locales/pt-BR.json';
import en from '@/locales/en.json';

const STORAGE_KEY = 'arandu-language';
const savedLng = localStorage.getItem(STORAGE_KEY) || 'pt-BR';

i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    en: { translation: en },
  },
  lng: savedLng,
  fallbackLng: 'pt-BR',
  interpolation: {
    escapeValue: false,
  },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(STORAGE_KEY, lng);
});

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY && e.newValue && e.newValue !== i18n.language) {
    i18n.changeLanguage(e.newValue);
  }
});

export default i18n;
