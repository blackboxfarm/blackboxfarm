import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format an "age in hours" number into a human-readable string.
 *  < 1h   -> "42m"
 *  < 24h  -> "7h 12m"
 *  < 7d   -> "2d 14h"
 *  >= 7d  -> "3w 2d"
 */
export function formatAgeHours(hours: number | null | undefined): string {
  if (hours == null || !isFinite(hours) || hours < 0) return "?";
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const m = totalMinutes - totalHours * 60;
    return m ? `${totalHours}h ${m}m` : `${totalHours}h`;
  }
  const totalDays = Math.floor(totalHours / 24);
  if (totalDays < 7) {
    const h = totalHours - totalDays * 24;
    return h ? `${totalDays}d ${h}h` : `${totalDays}d`;
  }
  const weeks = Math.floor(totalDays / 7);
  const d = totalDays - weeks * 7;
  return d ? `${weeks}w ${d}d` : `${weeks}w`;
}
