/**
 * TON Connect integration for wallet management
 */
import { TonConnectUI } from '@tonconnect/ui-react';

// TON wallet types
export interface TonWallet {
  address: string;
  balance?: string;
  network?: string;
  provider?: string;
}

// Настройки для манифеста TonConnect
const MANIFEST_URL = 'https://chance-tap.com/tonconnect-manifest.json';

// Создаем экземпляр TonConnect
const tonConnectUI = new TonConnectUI({
  manifestUrl: MANIFEST_URL,
  // Настройки для изображений кошельков
  uiPreferences: {
    theme: 'SYSTEM',
    walletIconPath: '/images/wallets/',
    buttonRootId: 'ton-connect-button'
  }
});

// Функция для подключения TON-кошелька
export const connectWallet = async (): Promise<TonWallet | null> => {
  try {
    // Подключаем кошелек через TonConnect UI
    await tonConnectUI.connectWallet();
    
    // Если успешно подключили - получаем адрес
    const wallet = tonConnectUI.wallet;
    
    if (!wallet) {
      throw new Error('Кошелек не удалось подключить');
    }
    
    const walletInfo: TonWallet = {
      address: wallet.account.address,
      provider: wallet.device.appName,
      network: wallet.account.chain === '1' ? 'mainnet' : 'testnet'
    };
    
    // Синхронизируем информацию с сервером
    const response = await fetch('/api/v1/wallet/connect', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ wallet: walletInfo })
    });

    if (!response.ok) {
      throw new Error('Не удалось зарегистрировать подключение кошелька на сервере');
    }

    return walletInfo;
  } catch (error) {
    console.error('Ошибка при подключении кошелька:', error);
    return null;
  }
};

// Функция для отключения TON-кошелька
export const disconnectWallet = async (): Promise<boolean> => {
  try {
    // Отключаем кошелек через TonConnect UI
    await tonConnectUI.disconnect();
    
    // Синхронизируем информацию с сервером
    const response = await fetch('/api/v1/wallet/disconnect', {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Не удалось отключить кошелек на сервере');
    }

    return true;
  } catch (error) {
    console.error('Ошибка при отключении кошелька:', error);
    return false;
  }
};

// Функция для проверки подключения кошелька
export const isWalletConnected = (): boolean => {
  try {
    // Проверяем подключение через TonConnect UI
    return tonConnectUI.connected;
  } catch (error) {
    console.error('Ошибка при проверке подключения кошелька:', error);
    return false;
  }
};

// Функция для получения информации о кошельке
export const getWalletInfo = async (): Promise<TonWallet | null> => {
  try {
    // Если кошелек не подключен, возвращаем null
    if (!tonConnectUI.connected || !tonConnectUI.wallet) {
      return null;
    }
    
    const wallet = tonConnectUI.wallet;
    
    // Получаем информацию о кошельке
    const walletInfo: TonWallet = {
      address: wallet.account.address,
      provider: wallet.device.appName,
      network: wallet.account.chain === '1' ? 'mainnet' : 'testnet'
    };
    
    // Можно дополнительно запросить баланс с сервера
    const response = await fetch('/api/v1/wallet/info', {
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json();
      // Обновляем баланс, если он доступен
      if (data.wallet && data.wallet.balance) {
        walletInfo.balance = data.wallet.balance;
      }
    }

    return walletInfo;
  } catch (error) {
    console.error('Ошибка при получении информации о кошельке:', error);
    return null;
  }
};

// Получение провайдера TonConnect
export const getTonProvider = () => {
  return tonConnectUI;
};

// Функция для создания транзакции
export const makePayment = async (
  amount: number, 
  receiverAddress: string, 
  comment: string = ''
): Promise<boolean> => {
  try {
    if (!tonConnectUI.connected) {
      throw new Error('Кошелек не подключен');
    }
    
    // Конвертируем сумму в наноТоны (1 TON = 10^9 наноТонов)
    const amountNano = Math.floor(amount * 1_000_000_000).toString();
    
    // Отправляем транзакцию
    await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 60 * 20, // Действительно 20 минут
      messages: [
        {
          address: receiverAddress,
          amount: amountNano,
          payload: comment ? comment : undefined
        }
      ]
    });
    
    // Регистрируем транзакцию на сервере
    const response = await fetch('/api/v1/payment/create', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        amount, 
        receiver: receiverAddress, 
        comment 
      }),
    });

    if (!response.ok) {
      console.warn('Транзакция отправлена, но не сохранена на сервере');
    }
    
    return true;
  } catch (error) {
    console.error('Ошибка при создании платежа:', error);
    return false;
  }
};
