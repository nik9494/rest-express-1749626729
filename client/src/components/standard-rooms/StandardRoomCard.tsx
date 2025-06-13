import { cn } from "@/lib/utils";
import { Room } from "@shared/types";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";

interface StandardRoomCardProps {
  room: Room;
  userBalance: number;
  isStub?: boolean; // добавлен пропс для stub-карточек
}

export function StandardRoomCard({ room, userBalance, isStub }: StandardRoomCardProps) {
  const [, navigate] = useLocation();
  const { t } = useTranslation();

  // Отладочная информация
  useEffect(() => {
    console.log(`🎯 StandardRoomCard for fee ${room.entry_fee} updated:`, {
      participants_count: room.participants_count,
      room,
    });
  }, [room.participants_count, room.entry_fee]);

  const handleRoomSelect = () => {
    if (isStub || !room.id) return; // не делаем переход, если это stub-карточка или нет id
    if (userBalance < room.entry_fee) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showPopup(
          {
            title: t("insufficient_balance"),
            message: `You need ${room.entry_fee} Stars to join this room. Would you like to add Stars?`,
            buttons: [
              { type: "cancel" },
              { type: "default", text: t("add_stars"), id: "add_stars" },
            ],
          },
          (buttonId: string) => {
            if (buttonId === "add_stars") {
              navigate("/profile");
            }
          },
        );
      }
    } else {
      navigate(`/waiting-room/standard/${room.id}`);
    }
  };

  return (
    <div
      className="bg-white rounded-xl shadow-md p-2 border border-telegram-gray-200 relative cursor-pointer hover:shadow-lg transition-shadow"
      onClick={handleRoomSelect}
    >
      <div className="absolute top-1 right-1 bg-[#0088CC] bg-opacity-10 text-xs px-1.5 py-0.5 rounded-full text-[#0088CC] font-medium transition-all duration-300">
        <i className="fas fa-users mr-1"></i>{" "}
        <span className="animate-pulse-subtle">
          {Number(room.participants_count ?? 0)}
        </span>
      </div>
      <div className="text-center mb-1">
        <div className="bg-[#0088CC] text-white inline-block px-2 py-0.5 rounded-full text-xs font-medium">
          {t("standard")}
        </div>
      </div>
      <div className="text-center">
        <div className="text-telegram-gray-700 text-xs mb-0.5">
          {t("entry_fee")}
        </div>
        <div className="text-base font-bold flex items-center justify-center text-[#0088CC]">
          <i className="fas fa-star text-yellow-400 mr-1"></i> {room.entry_fee}
        </div>
      </div>
      <div className="mt-1 text-center text-xs text-[#0088CC] font-medium">
        Автостарт при заполнении
      </div>
    </div>
  );
}
