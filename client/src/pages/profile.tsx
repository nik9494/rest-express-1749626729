import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { useTonConnect } from "@/hooks/useTonConnect";
import { truncateMiddle } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { showSuccess, showError } from "@/lib/telegram";
import { useTranslation } from 'react-i18next';
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const { wallet, isConnecting, isConnected, connect } = useTonConnect();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  
  // Fetch user data
  const { data, isLoading } = useQuery({
    queryKey: ['/api/v1/users/me'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/v1/users/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return response.json();
    },
  });
  const user = data?.user;
  
  // Copy wallet address to clipboard
  const handleCopyWalletAddress = () => {
    if (wallet?.address) {
      navigator.clipboard.writeText(wallet.address);
      toast({
        title: "Success",
        description: "Wallet address copied to clipboard",
      });
    }
  };
  
  // Add Stars (TON payment)
  const handleAddStars = () => {
    // This would trigger Telegram payment in production
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showPopup({
        title: "Add Stars",
        message: "Choose amount of Stars to add",
        buttons: [
          { type: "cancel" },
          { type: "default", text: "100 Stars", id: "100" },
          { type: "default", text: "500 Stars", id: "500" },
          { type: "default", text: "1000 Stars", id: "1000" }
        ]
      }, (buttonId: string) => {
        if (buttonId !== "cancel") {
          // Process payment
          window.Telegram.WebApp.showAlert("Payment processing would start here");
          
          // In production, this would initiate TON payment
          // For now, we'll just simulate adding stars
          addStars(parseInt(buttonId));
        }
      });
    }
  };
  
  // Simulated add stars mutation
  const { mutate: addStars } = useMutation({
    mutationFn: async (amount: number) => {
      const response = await apiRequest('POST', '/api/v1/users/addStars', { amount });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/users/me'] });
      toast({
        title: "Success",
        description: "Stars added successfully",
      });
    }
  });
  
  // Withdraw stars to TON wallet
  const handleWithdraw = () => {
    if (!isConnected) {
      connect();
      return;
    }
    
    // In production, this would withdraw to TON wallet
    window.Telegram?.WebApp?.showPopup({
      title: "Withdraw Stars",
      message: "Enter amount of Stars to withdraw to your TON wallet",
      buttons: [
        { type: "cancel" },
        { type: "default", text: "Withdraw", id: "withdraw" }
      ]
    });
  };
  
  // Share referral code
  const handleShareReferralCode = () => {
    if (user?.referral_code) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showPopup({
          title: "Share Referral Code",
          message: `Your code: ${user.referral_code}\n\nShare with friends to earn Stars!`,
          buttons: [
            { type: "cancel" },
            { type: "default", text: "Copy Code", id: "copy" }
          ]
        }, (buttonId: string) => {
          if (buttonId === "copy") {
            navigator.clipboard.writeText(user.referral_code);
            toast({
              title: "Success",
              description: "Referral code copied to clipboard",
            });
          }
        });
      }
    }
  };
  
  // Обработчик ошибок загрузки изображений кошелька
  const handleWalletImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    console.warn(`Failed to load wallet image: ${target.src}`);
    // Устанавливаем fallback изображение
    target.src = '/images/wallets/fallback.svg';
  };

  const getWalletImage = (walletType: string) => {
    const baseUrl = import.meta.env.VITE_WALLET_IMAGES_URL || '/images/wallets';
    switch (walletType.toLowerCase()) {
      case 'tokenpocket':
        return `${baseUrl}/tokenpocket.svg`;
      case 'tonkeeper':
        return `${baseUrl}/tonkeeper.svg`;
      case 'tonhub':
        return `${baseUrl}/tonhub.svg`;
      default:
        return `${baseUrl}/fallback.svg`;
    }
  };

  return (
    <>
      <Header title="Profile" />
      <div className="p-6 pb-20">
        {isLoading ? (
          // Loading state
          <div className="animate-pulse space-y-6">
            <div className="flex items-center mb-6">
              <div className="w-16 h-16 bg-gray-200 rounded-full mr-4"></div>
              <div>
                <div className="h-6 bg-gray-200 w-24 mb-2 rounded"></div>
                <div className="h-4 bg-gray-200 w-32 rounded"></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-md p-4 border border-gray-200 mb-6">
              <div className="h-5 bg-gray-200 w-24 mb-2 rounded"></div>
              <div className="h-8 bg-gray-200 w-full mb-3 rounded"></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-10 bg-gray-200 rounded"></div>
                <div className="h-10 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        ) : (
          user && (
            <>
              {/* User Info */}
              <div className="flex items-center mb-6">
                <div className="w-16 h-16 rounded-full overflow-hidden mr-4">
                  <img 
                    src={user.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=random`}
                    alt="Profile" 
                    className="w-full h-full object-cover" 
                  />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{user.username}</h2>
                  <p className="text-telegram-gray-600">{t('joined')}: {new Date(user.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Balance Card */}
              <div className="bg-white rounded-xl shadow-md p-4 border border-telegram-gray-200 mb-6">
                <h3 className="text-sm font-medium text-telegram-gray-600 mb-1">{t('your_balance')}</h3>
                <div className="text-2xl font-bold flex items-center">
                  <i className="fas fa-star text-yellow-400 mr-2"></i>
                  <span>{user.balance_stars}</span> <span className="ml-1 text-telegram-gray-600">Stars</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button 
                    className="bg-[#0088CC] text-white py-2 rounded text-sm font-medium whitespace-nowrap col-span-2"
                    onClick={handleAddStars}
                  >
                    <i className="fas fa-plus mr-1"></i> {t('add_stars')}
                  </button>
                  <button 
                    className="bg-telegram-gray-800 text-white py-2 rounded text-sm font-medium"
                    onClick={handleWithdraw}
                  >
                    <i className="fas fa-arrow-right mr-1"></i> {t('withdraw')}
                  </button>
                </div>
              </div>

              {/* TON Wallet Card */}
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">{t('ton_wallet')}</h3>
                  {isConnected && wallet && (
                    <span className="text-sm text-gray-500">
                      {wallet.network === 'mainnet' ? 'Mainnet' : 'Testnet'}
                    </span>
                  )}
                </div>

                {isConnected && wallet ? (
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <img 
                        src={getWalletImage(wallet.type)}
                        alt={wallet.type}
                        className="w-6 h-6"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = `${import.meta.env.VITE_WALLET_IMAGES_URL || '/images/wallets'}/fallback.svg`;
                        }}
                      />
                      <span className="font-mono text-sm">
                        {truncateMiddle(wallet.address, 10, 10)}
                      </span>
                    </div>
                    <button
                      onClick={handleCopyWalletAddress}
                      className="text-sm text-blue-500 hover:text-blue-600"
                    >
                      Copy Address
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={connect}
                    disabled={isConnecting}
                    className="w-full flex items-center justify-center space-x-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
                  >
                    <i className="fas fa-link mr-1"></i> {t('connect_wallet')}
                  </button>
                )}
              </div>

              {/* Statistics Card */}
              <div className="bg-white rounded-xl shadow-md p-4 border border-telegram-gray-200 mb-6">
                <h3 className="font-medium mb-3">{t('statistics')}</h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-telegram-gray-100 rounded-lg p-2">
                    <div className="text-xs text-telegram-gray-600">{t('total_games')}</div>
                    <div className="font-bold">{user.total_games || 0}</div>
                  </div>
                  <div className="bg-telegram-gray-100 rounded-lg p-2">
                    <div className="text-xs text-telegram-gray-600">{t('wins')}</div>
                    <div className="font-bold">{user.total_wins || 0}</div>
                  </div>
                  <div className="bg-telegram-gray-100 rounded-lg p-2">
                    <div className="text-xs text-telegram-gray-600">{t('win_rate')}</div>
                    <div className="font-bold">
                      {user.total_games ? Math.round((user.total_wins / user.total_games) * 100) : 0}%
                    </div>
                  </div>
                </div>
                <div className="mt-3 bg-telegram-gray-100 rounded-lg p-3">
                  <div className="flex justify-between">
                    <div className="text-sm">{t('total_won')}:</div>
                    <div className="font-bold flex items-center">
                      <i className="fas fa-star text-yellow-400 mr-1"></i> {user.total_won || 0}
                    </div>
                  </div>
                  <div className="flex justify-between mt-2">
                    <div className="text-sm">{t('total_taps')}:</div>
                    <div className="font-bold">{user.total_taps || 0}</div>
                  </div>
                </div>
              </div>

              {/* Referral System */}
              <div className="bg-white rounded-xl shadow-md p-4 border border-telegram-gray-200">
                <h3 className="font-medium mb-3">{t('referral_program')}</h3>
                <p className="text-sm text-telegram-gray-600 mb-3">
                  {t('invite_friends')}
                </p>
                <div className="bg-telegram-gray-100 rounded p-3 mb-3">
                  <div className="text-xs text-telegram-gray-600 mb-1">{t('your_referral_code')}</div>
                  <div className="font-bold text-lg tracking-wider text-center">
                    {user.referral_code || "N/A"}
                  </div>
                </div>
                <button 
                  className="w-full bg-[#0088CC] text-white py-2 rounded text-sm font-medium mb-3"
                  onClick={handleShareReferralCode}
                >
                  <i className="fas fa-share-alt mr-1"></i> {t('share_code')}
                </button>
                <div className="text-xs text-telegram-gray-600 flex justify-between">
                  <span>{t('referrals')}: <span className="font-bold">{user.referrals_count || 0}</span></span>
                  <span>{t('earned')}: <i className="fas fa-star text-yellow-400 mx-1"></i><span className="font-bold">{user.referrals_earned || 0}</span></span>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </>
  );
}
