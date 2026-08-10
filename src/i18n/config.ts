import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import es from "./locales/es.json";

const isBrowser = typeof window !== "undefined";

if (!i18n.isInitialized) {
  if (isBrowser) {
    i18n.use(LanguageDetector);
  }
  i18n.use(initReactI18next).init({
    // Resources are bundled with the app, so initialize synchronously. Without
    // this, the first production render can happen before i18next is ready and
    // permanently display raw keys such as `nav.browse`.
    initAsync: false,
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    lng: isBrowser ? undefined : "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
}

export default i18n;
