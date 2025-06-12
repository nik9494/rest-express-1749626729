import { cn } from "@/lib/utils";
import { Room } from "@shared/types";
import { useLocation } from "wouter";

interface RoomCardProps {
  room: Room;
  userBalance: number;
}

export function RoomCard({ room, userBalance }: RoomCardProps) {
  const [, navigate] = useLocation();

  const handleRoomSelect = () => {
    if (userBalance < room.entry_fee) {
      // If user doesn't have enough balance, redirect to payment page or show error
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showPopup(
          {
            title: "Insufficient Balance",
            message: `You need ${room.entry_fee} Stars to join this room. Would you like to add Stars?`,
            buttons: [
              { type: "cancel" },
              { type: "default", text: "Add Stars", id: "add_stars" },
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
      // If user has enough balance, enter the room
      navigate(`/waiting-room/standard/${room.id}`);
    }
  };

  return (
    <div
      className="bg-white rounded-xl shadow-md p-3 border border-telegram-gray-200 relative cursor-pointer"
      onClick={handleRoomSelect}
    >
      <div className="absolute top-2 right-2 bg-[#0088CC] bg-opacity-10 text-xs px-2 py-1 rounded-full text-[#0088CC] font-medium">
        <i className="fas fa-users mr-1"></i>{" "}
        {Number(room.participants_count ?? 0)} игроков
      </div>
      <div className="text-center mb-2">
        <div className="bg-[#0088CC] text-white inline-block px-3 py-1 rounded-full text-xs font-medium">
          Стандартная
        </div>
      </div>
      <div className="text-center">
        <div className="text-telegram-gray-700 text-sm mb-1">Вход</div>
        <div className="text-xl font-bold flex items-center justify-center text-[#0088CC]">
          <i className="fas fa-star text-yellow-400 mr-1"></i> {room.entry_fee}
        </div>
      </div>
      <div className="mt-3 bg-[#0088CC] bg-opacity-10 rounded-full h-1.5">
        <div
          className="bg-[#0088CC] h-1.5 rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(100, ((room.participants_count ?? 0) / 10) * 100)}%`,
          }}
        ></div>
      </div>
      <div className="mt-2 text-center text-xs text-[#0088CC] font-medium">
        Автостарт при заполнении
      </div>
    </div>
  );
}
