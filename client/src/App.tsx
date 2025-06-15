import { Route, Switch } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home";
import WaitingRoomStandardPage from "@/pages/waiting-room-standard";
import WaitingRoomHeroPage from "@/pages/waiting-room-hero";
import RoomRedirect from "@/components/common/RoomRedirect";
import GameResultsPage from "@/pages/game-results";
import BonusRoomPage from "@/pages/bonus-room";
import HeroRoomPage from "@/pages/hero-room";
import CreateHeroRoomPage from "@/pages/create-hero-room";
import ProfilePage from "@/pages/profile";
import LeaderboardPage from "@/pages/leaderboard";
import BottomNavigation from "@/components/layout/BottomNavigation";
import { useTelegram } from "@/hooks/useTelegram";
import { useEffect } from "react";
import HeroGameRoomPage from "@/pages/hero-game-room";
import StandardGameRoomPage from "@/pages/standard-game-room";

function App() {
  const { initTelegram } = useTelegram();

  useEffect(() => {
    // Инициализация Telegram Web App
    if (window.Telegram?.WebApp) {
      // Расширяем на весь экран
      window.Telegram.WebApp.expand();
      window.Telegram.WebApp.setHeaderColor('rgb(32,0,105)');
      window.Telegram.WebApp.setBackgroundColor('rgb(35,0,130)'); // прозрачный фон для отображения background body
      window.Telegram.WebApp.disableClosingConfirmation();
      window.Telegram.WebApp.enableClosingConfirmation();
    }
    // ВАЖНО: инициируем авторизацию через Telegram
    initTelegram();
  }, [initTelegram]);

  // Добавляем обработчик ошибок загрузки изображений
  useEffect(() => {
    const handleImageError = (e: Event) => {
      const target = e.target as HTMLImageElement;
      console.warn(`Failed to load image: ${target.src}`);
      // Можно установить fallback изображение
      target.src = "/images/wallets/fallback.png";
    };

    document.addEventListener("error", handleImageError, true);
    return () => {
      document.removeEventListener("error", handleImageError, true);
    };
  }, []);

  return (
    <TooltipProvider>
      <div className="max-w-md mx-auto min-h-screen relative shadow-md">
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/waiting-room/:roomId" component={RoomRedirect} />
          <Route
            path="/waiting-room/standard/:roomId"
            component={WaitingRoomStandardPage}
          />
          <Route
            path="/waiting-room/hero/:roomId"
            component={WaitingRoomHeroPage}
          />
          <Route path="/hero-game-room/:roomId" component={HeroGameRoomPage} />
          <Route path="/standard-game-room/:roomId" component={StandardGameRoomPage} />
          <Route path="/game-results/:gameId" component={GameResultsPage} />
          <Route path="/bonus-room" component={BonusRoomPage} />
          <Route path="/hero-room" component={HeroRoomPage} />
          <Route path="/create-hero-room" component={CreateHeroRoomPage} />
          <Route path="/profile" component={ProfilePage} />
          <Route path="/leaderboard" component={LeaderboardPage} />
          <Route component={NotFound} />
        </Switch>

        <BottomNavigation />
        <Toaster />
      </div>
    </TooltipProvider>
  );
}

export default App;
