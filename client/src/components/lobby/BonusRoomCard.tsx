import { useLocation } from "wouter";

interface BonusRoomCardProps {
  bonusAmount: number;
  onClick?: () => void;
}

export function BonusRoomCard({ bonusAmount, onClick }: BonusRoomCardProps) {
  const [, navigate] = useLocation();

  const handleStartBonus = () => {
    if (onClick) {
      onClick();
    } else {
      navigate("/bonus-room");
    }
  };

  return (
    <div className="bg-gradient-to-br from-[#E7F5FF] to-[#F0F9FF] rounded-xl shadow-sm border border-[#0088CC]/20 relative hover:shadow-md transition-shadow overflow-hidden">
      <div className="flex items-stretch">
        <div className="flex items-center gap-2 px-3 py-2 flex-1">
          <div className="text-telegram-gray-600 text-sm font-medium">Bonus Room</div>
          <div className="flex items-center bg-[#0088CC]/10 text-[#0088CC] text-sm px-2 py-1 rounded-full">
            <i className="fas fa-gift mr-1"></i>
            <span className="font-bold">
              <i className="fas fa-star text-yellow-400 mr-1"></i> {bonusAmount}
            </span>
          </div>
        </div>
        <button 
          className="bg-[#0088CC] text-white text-sm px-4 font-medium hover:bg-[#0077B3] transition-colors rounded-xl"
          onClick={handleStartBonus}
        >
          Start
        </button>
      </div>
    </div>
  );
}
