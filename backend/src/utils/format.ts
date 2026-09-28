const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** $568.70 — negatives use a true minus sign to match the frontend. */
export function formatCurrency(value: number): string {
  return currency.format(value).replace(/^-/, '−');
}

/** 0.1869 → "18.7%" (digits = 1) */
export function formatPercent(value: number, digits = 1): string {
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return fmt.format(value).replace(/^-/, '−');
}
