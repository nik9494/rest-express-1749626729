import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useTranslation } from 'react-i18next';

interface HeaderProps {
  title: string;
  showBackButton?: boolean;
  onBackClick?: () => void;
  rightContent?: React.ReactNode;
  className?: string;
}

export function Header({
  title,
  showBackButton = false,
  onBackClick,
  rightContent,
  className,
}: HeaderProps) {
  const [, navigate] = useLocation();
  const { t, i18n } = useTranslation();

  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      navigate("/");
    }
  };

  const handleLangChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('lang', lang);
  };

  return (
    <header className={cn("px-4 py-3 bg-white shadow-sm sticky top-0 z-10 flex items-center justify-between", className)}>
      <div className="flex items-center flex-1">
        {showBackButton ? (
          <button className="text-[#0088CC] mr-2" onClick={handleBackClick}>
            <i className="fas fa-arrow-left"></i>
          </button>
        ) : (
          // Название приложения всегда статичное
          <h1 className="text-xl font-bold text-[#0088CC] select-none">Chance Tap</h1>
        )}
        {showBackButton && (
          <h1 className="text-lg font-medium">{title}</h1>
        )}
      </div>
      {/* Правая часть хедера с фиксированной шириной */}
      <div className="flex items-center gap-2 min-w-[120px] justify-end">
        {rightContent}
        <button
          className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 transition"
          onClick={() => {
            const nextLang = i18n.language === 'ru' ? 'en' : 'ru';
            handleLangChange(nextLang);
          }}
          aria-label="Switch language"
        >
          <span className="text-sm font-medium">
            {i18n.language === 'ru' ? 'En' : 'Ru'}
          </span>
        </button>
      </div>
    </header>
  );
}
