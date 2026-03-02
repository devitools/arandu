import { ptBR } from 'date-fns/locale';
import { enUS } from 'date-fns/locale';

const localeMap: Record<string, Locale> = {
  'pt-BR': ptBR,
  en: enUS,
};

export function getDateLocale(language: string): Locale {
  return localeMap[language] ?? ptBR;
}
