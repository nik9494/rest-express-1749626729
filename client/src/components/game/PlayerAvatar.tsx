import { Player } from "@shared/types";
import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  player: Player | null;
  isCurrentUser?: boolean;
  isReady?: boolean;
  taps?: number;
  onClick?: (player: Player) => void;
  className?: string;
}

export function PlayerAvatar({ 
  player, 
  isCurrentUser = false, 
  isReady = false,
  taps = 0,
  onClick,
  className
}: PlayerAvatarProps) {
  if (!player) {
    return (
      <div className={cn(
        "w-14 h-14 rounded-full bg-telegram-gray-100 border-2 border-dashed border-telegram-gray-300",
        className
      )} />
    );
  }

  const handleClick = () => {
    if (onClick && player) {
      onClick(player);
    }
  };

  return (
    <div 
      className={cn(
        "relative group cursor-pointer",
        className
      )}
      onClick={handleClick}
    >
      <div className={cn(
        "w-14 h-14 rounded-full overflow-hidden border-2",
        isCurrentUser ? 'border-[#0088CC]' : 'border-telegram-gray-300',
        player.is_observer && 'border-amber-500'
      )}>
        <img 
          src={player.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(player.username)}&background=random`}
          alt={isCurrentUser ? 'You' : player.username}
          className="w-full h-full object-cover"
        />
      </div>
      
      {/* Player name */}
      <div className="mt-1 text-xs font-medium text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-[70px] mx-auto">
        {isCurrentUser ? 'You' : player.username}
      </div>
      
      {/* Taps count */}
      {taps > 0 && (
        <div className="mt-0.5 text-xs font-bold text-center text-[#0088CC]">
          {taps} taps
        </div>
      )}
      
      {/* Observer badge */}
      {player.is_observer && (
        <div className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">
          OBS
        </div>
      )}
      
      {/* Ready indicator */}
      {isReady && !player.is_observer && (
        <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">
          ✓
        </div>
      )}
    </div>
  );
}
