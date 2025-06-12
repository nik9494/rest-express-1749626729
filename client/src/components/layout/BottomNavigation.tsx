import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useTranslation } from 'react-i18next';

interface NavItem {
  labelKey: string;
  icon: string;
  path: string;
  screen: string;
}

const navItems: NavItem[] = [
  { labelKey: "home", icon: "fa-home", path: "/", screen: "home-screen" },
  { labelKey: "leaderboard", icon: "fa-trophy", path: "/leaderboard", screen: "leaderboard-screen" },
  { labelKey: "profile", icon: "fa-user", path: "/profile", screen: "profile-screen" },
  { labelKey: "create_room", icon: "fa-plus-circle", path: "/hero-room", screen: "hero-room" },
];

export default function BottomNavigation() {
  const [location, navigate] = useLocation();
  const { t } = useTranslation();

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-telegram-gray-200 px-2 py-1 flex justify-around items-center z-20 max-w-md mx-auto">
      {navItems.map((item) => {
        const isActive = location === item.path || 
          // Special case for home screen with sub-routes
          (item.path === "/" && 
           !navItems.some(navItem => navItem.path !== "/" && location.startsWith(navItem.path)));
        
        return (
          <button
            key={item.path}
            className={cn(
              "flex flex-col items-center py-1 px-3 focus:outline-none",
              isActive ? "text-[#0088CC]" : "text-telegram-gray-600"
            )}
            onClick={() => handleNavigate(item.path)}
          >
            <i className={`fas ${item.icon} text-lg`}></i>
            <span className="text-xs mt-1">{t(item.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
