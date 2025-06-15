import { Route, Switch, useLocation } from "wouter";
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
import { useEffect, useState, memo } from "react";
import HeroGameRoomPage from "@/pages/hero-game-room";
import StandardGameRoomPage from "@/pages/standard-game-room";
import SwipeablePages from "@/components/layout/SwipeablePages";

const MemoHomePage = memo(HomePage);
const MemoLeaderboardPage = memo(LeaderboardPage);
const MemoProfilePage = memo(ProfilePage);
const MemoHeroRoomPage = memo(HeroRoomPage);

const MAIN_PAGES = [
  { path: "/", component: MemoHomePage },
  { path: "/leaderboard", component: MemoLeaderboardPage },
  { path: "/profile", component: MemoProfilePage },
  { path: "/hero-room", component: MemoHeroRoomPage },
];

function App() {
  const { initTelegram } = useTelegram();
  const [location, wouterNavigate] = useLocation();
  const [pageIndex, setPageIndex] = useState(() => {
    const idx = MAIN_PAGES.findIndex(p => window.location.pathname === p.path);
    return idx === -1 ? 0 : idx;
  });

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

  // --- СИНХРОНИЗАЦИЯ СТЕЙТА ДЛЯ СВАЙПОВ ---
  // Синхронизация свайпа с роутером
  useEffect(() => {
    const idx = MAIN_PAGES.findIndex(p => location === p.path);
    if (idx !== -1 && idx !== pageIndex) setPageIndex(idx);
  }, [location]);

  // При свайпе меняем url
  const handleChangeIndex = (idx: number) => {
    setPageIndex(idx);
    wouterNavigate(MAIN_PAGES[idx].path);
  };

  // Проверяем, нужно ли показывать свайповые страницы
  const isMainPage = MAIN_PAGES.some(p => p.path === location);

  return (
    <TooltipProvider>
      <div
        className="max-w-md mx-auto min-h-screen relative shadow-md"
        style={isMainPage
          ? { height: '100vh', overflow: 'hidden' }
          : { minHeight: '100vh' }}
      >
        {isMainPage && (
          <SwipeablePages index={pageIndex} onChangeIndex={handleChangeIndex}>
            {MAIN_PAGES.map((p, i) => (
              <div key={p.path} style={{ width: '100%', height: '100%', maxHeight: '100vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <p.component />
              </div>
            ))}
          </SwipeablePages>
        )}
        {/* Остальные роуты */}
        <Switch>
          {/* Исключаем основные страницы из Switch */}
          <Route path="/waiting-room/:roomId" component={RoomRedirect} />
          <Route path="/waiting-room/standard/:roomId" component={WaitingRoomStandardPage} />
          <Route path="/waiting-room/hero/:roomId" component={WaitingRoomHeroPage} />
          <Route path="/hero-game-room/:roomId" component={HeroGameRoomPage} />
          <Route path="/standard-game-room/:roomId" component={StandardGameRoomPage} />
          <Route path="/game-results/:gameId" component={GameResultsPage} />
          <Route path="/bonus-room" component={BonusRoomPage} />
          <Route path="/create-hero-room" component={CreateHeroRoomPage} />
          <Route component={NotFound} />
        </Switch>
        <BottomNavigation pageIndex={isMainPage ? pageIndex : undefined} setPageIndex={isMainPage ? setPageIndex : undefined} />
        <Toaster />
      </div>
    </TooltipProvider>
  );
}

export default App;
