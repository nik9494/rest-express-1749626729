import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names with Tailwind CSS
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a number with commas as thousands separators
 */
export function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

/**
 * Formats time in mm:ss format
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Formats time in hh:mm:ss format
 */
export function formatLongTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Truncates a string with ellipsis in the middle
 */
export function truncateMiddle(text: string, startChars = 8, endChars = 8): string {
  if (text.length <= startChars + endChars) {
    return text;
  }
  return `${text.substring(0, startChars)}...${text.substring(text.length - endChars)}`;
}

/**
 * Generate random emojis
 */
export function getRandomEmoji(): string {
  const emojis = ["😀", "😂", "🎉", "👍", "❤️", "🔥", "⭐", "🚀", "🎮", "🏆"];
  return emojis[Math.floor(Math.random() * emojis.length)];
}

/**
 * Creates ripple effect for tap button
 */
export function createRippleEffect(element: HTMLElement) {
  const ripple = document.createElement("span");
  const rect = element.getBoundingClientRect();
  
  ripple.style.position = "absolute";
  ripple.style.width = ripple.style.height = `${Math.max(rect.width, rect.height)}px`;
  ripple.style.left = ripple.style.top = "0";
  ripple.style.borderRadius = "50%";
  ripple.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
  ripple.style.transform = "scale(0)";
  ripple.style.animation = "ripple 0.6s linear forwards";
  
  element.appendChild(ripple);
  
  setTimeout(() => {
    ripple.remove();
  }, 600);
}

/**
 * Throttle function to limit execution rate
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  let inThrottle = false;
  let lastResult: ReturnType<T> | undefined;
  
  return function(this: any, ...args: Parameters<T>): ReturnType<T> | undefined {
    if (!inThrottle) {
      lastResult = func.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
    return lastResult;
  };
}
