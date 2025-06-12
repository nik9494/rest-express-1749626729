import { useLocation } from "wouter";

interface HeroRoomCardProps {
  onClick?: () => void;
}

export function HeroRoomCard({ onClick }: HeroRoomCardProps) {
  const [, navigate] = useLocation();

  const handleEnterHero = () => {
    if (onClick) {
      onClick();
    } else {
      navigate("/hero-room");
    }
  };

  return (
    <div className="bg-gradient-to-br from-amber-50 to-yellow-100 rounded-xl shadow-md p-4 border border-amber-300 relative overflow-hidden">
      <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs px-2 py-1 rounded-full font-medium">
        <i className="fas fa-crown mr-1"></i> Hero
      </div>
      <div className="text-center mt-2">
        <div className="text-amber-700 text-sm mb-1 font-medium">
          Кастомные игры
        </div>
        <div className="text-lg font-bold text-amber-600 mb-2">
          Создай или присоединись
        </div>
        <div className="text-xs text-amber-600 mb-3">
          • Организатор получает 10%
          <br />
          • Настраиваемые правила
          <br />• Уникальный код комнаты
        </div>
      </div>
      <div className="text-center">
        <button
          className="bg-amber-500 hover:bg-amber-600 text-white text-sm py-2 px-6 rounded-full font-medium transition-colors"
          onClick={handleEnterHero}
        >
          Войти в Hero
        </button>
      </div>
      {/* Decorative elements */}
      <div className="absolute -top-2 -right-2 w-8 h-8 bg-amber-200 rounded-full opacity-50"></div>
      <div className="absolute -bottom-1 -left-1 w-6 h-6 bg-yellow-200 rounded-full opacity-30"></div>
    </div>
  );
}
