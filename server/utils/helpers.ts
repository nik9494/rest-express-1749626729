// Helper functions for the server

/**
 * Returns a random emoji from the list
 */
export function getRandomEmoji(): string {
  const emojis = [
    "👍", "👎", "👌", "👏", "🙌", "👋", "🔥", "💯", "❤️", "😊", 
    "😂", "🤣", "😍", "🤔", "🤨", "😎", "🥳", "🚀", "✨", "⚡"
  ];
  
  return emojis[Math.floor(Math.random() * emojis.length)];
}

/**
 * Generates a random code of specified length
 */
export function generateRandomCode(length = 6): string {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
}

// Added for compatibility with rooms controller
export function generateRoomCode(length = 6): string {
  return generateRandomCode(length);
}

// Added for compatibility with users controller
export function generateReferralCode(length = 8): string {
  return generateRandomCode(length);
}

/**
 * Formats a number with commas for thousands
 */
export function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Returns a formatted time string from seconds
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}