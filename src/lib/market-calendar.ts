export function isWeekendUtc(date = new Date()): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}