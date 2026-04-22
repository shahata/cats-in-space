/**
 * Format a price using Intl.NumberFormat for proper currency symbol and placement per locale.
 * Example: formatCurrency(9.99, 'USD', 'en-US') → "$9.99"
 *          formatCurrency(9.99, 'ILS', 'he-IL') → "‏9.99 ₪"
 */
export function formatCurrency(
  amount: number | string,
  currencyCode: string,
  locale: string,
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return String(amount);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: num % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currencyCode} ${num}`;
  }
}

/**
 * Map a billing cycle unit (DAY, WEEK, MONTH, YEAR) to a translation key.
 */
export function cyclePeriodKey(unit: string): string {
  const map: Record<string, string> = {
    DAY: "plans.perDay",
    WEEK: "plans.perWeek",
    MONTH: "plans.perMonth",
    YEAR: "plans.perYear",
  };
  return map[unit.toUpperCase()] || unit.toLowerCase();
}
