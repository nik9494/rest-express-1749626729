import { useState, useEffect, useCallback } from 'react';
import { 
  connectWallet, 
  disconnectWallet, 
  isWalletConnected, 
  getWalletInfo,
  makePayment,
  TonWallet
} from '@/lib/tonConnect';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { showSuccess, showError } from '@/lib/telegram';

export const useTonConnect = () => {
  const [wallet, setWallet] = useState<TonWallet | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();

  // Check wallet connection on mount
  const checkConnection = useCallback(async () => {
    try {
      const connected = await isWalletConnected();
      setIsConnected(connected);
      
      if (connected) {
        const walletInfo = await getWalletInfo();
        setWallet(walletInfo);
      }
    } catch (error) {
      console.error('Error checking wallet connection:', error);
    }
  }, []);

  // Connect wallet
  const connect = useCallback(async () => {
    setIsConnecting(true);
    
    try {
      const walletInfo = await connectWallet();
      if (walletInfo) {
        setWallet(walletInfo);
        setIsConnected(true);
        
        // Invalidate user query to update has_ton_wallet flag
        queryClient.invalidateQueries({ queryKey: ['/api/v1/users/me'] });
        
        showSuccess('Wallet connected successfully');
      } else {
        toast({
          title: 'Connection Failed',
          description: 'Could not connect to TON wallet',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      toast({
        title: 'Connection Error',
        description: 'An error occurred while connecting to wallet',
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  // Disconnect wallet
  const disconnect = useCallback(async () => {
    try {
      const success = await disconnectWallet();
      if (success) {
        setWallet(null);
        setIsConnected(false);
        
        // Invalidate user query to update has_ton_wallet flag
        queryClient.invalidateQueries({ queryKey: ['/api/v1/users/me'] });
        
        toast({
          title: 'Wallet Disconnected',
          description: 'Your TON wallet has been disconnected',
        });
      }
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      toast({
        title: 'Disconnection Error',
        description: 'An error occurred while disconnecting the wallet',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Make a payment
  const pay = useCallback(async (amount: number, comment: string = '') => {
    if (!isConnected) {
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your TON wallet first',
        variant: 'destructive',
      });
      return false;
    }
    
    try {
      const success = await makePayment(amount, comment);
      if (success) {
        showSuccess('Payment successful!');
        // Invalidate user query to update balance
        queryClient.invalidateQueries({ queryKey: ['/api/v1/users/me'] });
        return true;
      } else {
        showError('Payment failed');
        return false;
      }
    } catch (error) {
      console.error('Error making payment:', error);
      showError('Payment failed: An error occurred');
      return false;
    }
  }, [isConnected, toast]);

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  return {
    wallet,
    isConnecting,
    isConnected,
    connect,
    disconnect,
    pay
  };
};
