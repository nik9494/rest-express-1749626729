/**
 * TON Address validator utilities
 */

// Validate TON address format
export function isValidTonAddress(address: string): boolean {
  // Basic validation
  if (!address) return false;
  
  // TON addresses usually start with "EQ" or "UQ" followed by base64 chars
  const tonAddressRegex = /^(?:EQ|UQ)[a-zA-Z0-9_-]{46}$/;
  
  return tonAddressRegex.test(address);
}

// Validate TON transaction
export function validateTonTransaction(transaction: any): boolean {
  // In a real implementation, this would validate transaction details
  // against the TON blockchain
  
  // For demo purposes, we'll assume all transactions are valid
  return true;
}

// Format TON amount (nanograms to TON)
export function formatTonAmount(nanograms: number): string {
  // 1 TON = 10^9 nanograms
  return (nanograms / 1_000_000_000).toFixed(9);
}

// Convert TON to nanograms
export function tonToNano(tons: number): number {
  return Math.floor(tons * 1_000_000_000);
}

// Convert nanograms to TON
export function nanoToTon(nanos: number): number {
  return nanos / 1_000_000_000;
}

// Get TON transfer fee estimate
export function estimateTonTransferFee(): number {
  // In a real implementation, this would calculate the actual fee
  // based on current network conditions
  
  // Standard TON transfer fee is around 0.01 TON
  return 0.01;
}
