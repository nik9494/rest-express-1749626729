import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { StandardRoomCard } from "@/components/standard-rooms/StandardRoomCard";
import { BonusRoomCard } from "@/components/lobby/BonusRoomCard";
import { Room } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { useTelegram } from "@/hooks/useTelegram";
import { useTranslation } from "react-i18next";
import { useRoomCounts } from "@/hooks/useRoomCounts";

interface User {
  id: string;
  telegram_id: number;
  username: string;
  balance_stars: number;
  has_ton_wallet: boolean;
  photo_url?: string;
}

// --- КОНСТАНТЫ ЦЕН ВХОДА ---
const ENTRY_FEES = [20, 50, 100, 200];

export default function HomePage() {
  const { telegramUser } = useTelegram();
  const { t, i18n } = useTranslation();
  // Получаем пользователя
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ["/api/v1/users/me"],
    enabled: !!localStorage.getItem("token"),
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/v1/users/me", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return response.json();
    },
  });
  const user: User | null = userData?.user || null;

  // Используем WebSocket для получения счетчиков комнат в реальном времени
  const {
    getStandardRoomCount,
    isLoading: countsLoading,
    connected,
    roomCounts,
  } = useRoomCounts(user?.id);

  // Логирование для отладки
  useEffect(() => {
    console.log("🏠 Home page WebSocket state:", {
      connected,
      userId: user?.id,
      roomCounts,
      countsLoading,
    });
  }, [connected, user?.id, roomCounts, countsLoading]);

  // Fallback API запрос для случаев, когда WebSocket недоступен
  const {
    data: fallbackCountsData,
    refetch: refetchCounts,
    isLoading: fallbackCountsLoading,
  } = useQuery({
    queryKey: ["/api/v1/standard-rooms/counts"],
    enabled: !connected && !!user, // Используем только если WebSocket не подключен
    queryFn: async () => {
      const response = await fetch("/api/v1/standard-rooms/counts");
      return response.json();
    },
  });
  const fallbackRoomCounts: Record<number, number> =
    fallbackCountsData?.counts || {};

  // --- АВТОПОДБОР КОМНАТЫ ---
  const [joining, setJoining] = useState<number | null>(null);
  const handleJoinRoom = async (entryFee: number) => {
    if (!user) return;
    setJoining(entryFee);
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/v1/standard-rooms/auto-join", {
        method: "POST",
        headers,
        body: JSON.stringify({ entry_fee: entryFee }),
      });
      const data = await res.json();
      if (data.room && data.room.id) {
        window.location.href = `/waiting-room/standard/${data.room.id}`;
      }
    } finally {
      setJoining(null);
      // WebSocket автоматически обновит счетчики, но на всякий случай обновим fallback
      if (!connected) {
        refetchCounts();
      }
    }
  };

  const isLoading = userLoading || (countsLoading && fallbackCountsLoading);

  return (
    <>
      <Header
        // Название приложения всегда статичное
        title="Chance Tap"
        rightContent={
          user && (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <img
                  src={
                    user.photo_url ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=random`
                  }
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user.username}</span>
                <div className="flex items-center text-xs text-[#4CAF50] font-medium">
                  <i className="fas fa-star text-yellow-400 mr-1"></i>
                  <span>{user.balance_stars}</span>{" "}
                  <span className="ml-1">Stars</span>
                </div>
              </div>
            </div>
          )
        }
      />

      {/* Standard Rooms Grid */}
      <div className="p-3">
        <h2 className="text-lg font-semibold mb-2 text-[#0088CC]">
          {t("standard_rooms")}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {isLoading
            ? Array(4)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={i}
                    className="bg-gray-100 rounded-xl shadow-md p-2 animate-pulse h-20"
                  ></div>
                ))
            : ENTRY_FEES.map((fee) => (
                <div
                  key={fee}
                  onClick={() => handleJoinRoom(fee)}
                  style={{
                    opacity: joining === fee ? 0.5 : 1,
                    pointerEvents: joining ? "none" : "auto",
                  }}
                >
                  <StandardRoomCard
                    room={{
                      id: "stub", // теперь всегда строка, чтобы не было ошибки типов
                      creator_id: "system",
                      type: "standard",
                      entry_fee: fee,
                      max_players: 10,
                      status: "waiting",
                      created_at: new Date(),
                      participants_count: (() => {
                        const count = connected
                          ? getStandardRoomCount(fee)
                          : fallbackRoomCounts[fee] || 0;
                        console.log(`🎯 Room ${fee} count:`, count, {
                          connected,
                          wsCount: getStandardRoomCount(fee),
                          fallbackCount: fallbackRoomCounts[fee],
                        });
                        return count;
                      })(),
                    }}
                    userBalance={user?.balance_stars || 0}
                    isStub={true}
                  />
                </div>
              ))}
        </div>
      </div>

      {/* Bonus Room - внизу страницы */}
      {!isLoading && (
        <div className="px-3 pb-3">
          <BonusRoomCard bonusAmount={3000} />
        </div>
      )}
    </>
  );
}
