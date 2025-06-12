import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t, i18n } = useTranslation();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">{t('not_found_title')}</h1>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            {t('not_found_hint')}
          </p>
          <select
            className="mt-6 border rounded px-2 py-1 text-sm"
            value={i18n.language}
            onChange={e => {
              i18n.changeLanguage(e.target.value);
              localStorage.setItem('lang', e.target.value);
            }}
          >
            <option value="ru">Рус</option>
            <option value="en">Eng</option>
          </select>
        </CardContent>
      </Card>
    </div>
  );
}
