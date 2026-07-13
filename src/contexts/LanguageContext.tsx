import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, translations } from '../lib/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  translateData: (text: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('app_language');
    return (saved as Language) || 'en';
  });

  useEffect(() => {
    localStorage.setItem('app_language', language);
  }, [language]);

  const t = (key: string): string => {
    return translations[language][key] || translations['en'][key] || key;
  };

  const translateData = (text: string): string => {
    if (!text) return text;
    if (language === 'en') return text;
    
    // Normalize text for key lookup
    const key = text.toLowerCase().trim()
      .replace(/&/g, 'and')
      .replace(/ /g, '_')
      .replace(/[^a-z0-9_]/g, '');
    
    // Try exact match first, then normalized key
    if (translations[language][text]) return translations[language][text];
    return translations[language][key] || text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, translateData }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
