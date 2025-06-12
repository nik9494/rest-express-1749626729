import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getWaitingRoomUrl } from "@/utils/roomUtils";

/**
 * Компонент для автоматического перенаправления на правильную страницу ожидания
 * в зависимости от типа комнаты
 */
export default function RoomRedirect() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, navigate] = useLocation();

  // Определяем тип комнаты
  const { data: roomData, isLoading } = useQuery({
    queryKey: ["/api/v1/rooms/type/" + roomId],
    queryFn: async () => {
      if (!roomId) throw new Error("Room ID is missing");

      // Сначала пробуем Hero-комнату
      try {
        const heroResponse = await fetch(`/api/v1/hero-rooms/${roomId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });
        if (heroResponse.ok) {
          const data = await heroResponse.json();
          return { type: "hero", room: data.room };
        }
      } catch (error) {
        // Игнорируем ошибку и пробуем стандартную комнату
      }

      // Пробуем стандартную комнату
      try {
        const standardResponse = await fetch(
          `/api/v1/standard-rooms/${roomId}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          },
        );
        if (standardResponse.ok) {
          const data = await standardResponse.json();
          return { type: "standard", room: data.room };
        }
      } catch (error) {
        // Комната не найдена
      }

      throw new Error("Room not found");
    },
    enabled: !!roomId,
    retry: false,
  });

  useEffect(() => {
    if (roomData && roomId) {
      const correctUrl = getWaitingRoomUrl(roomData.type, roomId);
      navigate(correctUrl, { replace: true });
    }
  }, [roomData, roomId, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0088CC] mx-auto mb-2"></div>
          <div>Определяем тип комнаты...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div>Комната не найдена</div>
        <button
          onClick={() => navigate("/")}
          className="mt-4 bg-[#0088CC] text-white px-4 py-2 rounded-lg"
        >
          Вернуться на главную
        </button>
      </div>
    </div>
  );
}
