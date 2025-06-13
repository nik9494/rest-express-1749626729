import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getWaitingRoomUrl } from "@/utils/roomUtils";
import { useToast } from "@/hooks/use-toast";

/**
 * Компонент для автоматического перенаправления на правильную страницу ожидания
 * в зависимости от типа комнаты
 */
export default function RoomRedirect() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Определяем тип комнаты
  const { data: roomData, isLoading } = useQuery({
    queryKey: ["/api/v1/rooms/type/" + roomId],
    queryFn: async () => {
      if (!roomId) throw new Error("Room ID is missing");

      // Пробуем получить тип комнаты через hero-rooms
      try {
        const response = await fetch(`/api/v1/hero-rooms/${roomId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          return { type: "hero", room: data.room };
        }
      } catch (error) {
        console.error("Error fetching hero room:", error);
      }

      // Если не hero-комната, пробуем стандартную
      try {
        const response = await fetch(`/api/v1/standard-rooms/${roomId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          return { type: "standard", room: data.room };
        }
      } catch (error) {
        console.error("Error fetching standard room:", error);
      }

      throw new Error("Room not found");
    },
    enabled: !!roomId,
    retry: false,
  });

  // Перенаправляем на правильную страницу ожидания
  useEffect(() => {
    if (!isLoading && roomData) {
      const { type, room } = roomData;
      const waitingRoomUrl = getWaitingRoomUrl(type, room.id);
      navigate(waitingRoomUrl);
    }
  }, [roomData, isLoading, navigate]);

  // Показываем ошибку, если комната не найдена
  useEffect(() => {
    if (!isLoading && !roomData) {
      toast({
        title: "Ошибка",
        description: "Комната не найдена или была удалена",
        variant: "destructive",
      });
      navigate("/");
    }
  }, [roomData, isLoading, toast, navigate]);

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
