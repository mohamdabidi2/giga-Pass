/**
 * Date utility for Tunisia timezone ('Africa/Tunis', UTC+1).
 * Computes exact startOfDay (00:00:00.000) and endOfDay (23:59:59.999) in Africa/Tunis.
 */
export function getTunisiaDayBounds(date: Date = new Date()): { startOfDay: Date; endOfDay: Date } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Tunis',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const [yyyy, mm, dd] = formatter.format(date).split('-').map(Number);

  // Africa/Tunis is UTC+1 year-round.
  // 00:00:00.000 Tunisia = (Day - 1) 23:00:00.000 UTC
  // 23:59:59.999 Tunisia = (Day) 22:59:59.999 UTC
  const startOfDay = new Date(Date.UTC(yyyy, mm - 1, dd, -1, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(yyyy, mm - 1, dd, 22, 59, 59, 999));

  return { startOfDay, endOfDay };
}
