import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

export const SUPPORTED_LANGUAGES = ['vi', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

type ResourceBundle = Record<string, unknown>;

/**
 * Every file at `locales/<language>/<namespace>.json` is registered automatically,
 * so a feature only has to drop its own namespace files into both language folders.
 */
const modules = import.meta.glob<ResourceBundle>('../locales/*/*.json', {
  eager: true,
  import: 'default',
});

const resources: Record<string, Record<string, ResourceBundle>> = {};
const namespaces = new Set<string>();

for (const [path, bundle] of Object.entries(modules)) {
  const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!match) continue;
  const [, language, namespace] = match;
  (resources[language] ??= {})[namespace] = bundle;
  namespaces.add(namespace);
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    ns: [...namespaces],
    defaultNS: 'common',
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LANGUAGES],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'scw.language',
      caches: ['localStorage'],
    },
  });

export default i18n;
