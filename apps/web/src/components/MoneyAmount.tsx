import { formatMinorUnits } from '@quidsin/shared';

export function MoneyAmount({
  amountMinorUnits,
  currency = 'GBP',
  className,
}: {
  amountMinorUnits: number;
  currency?: string;
  className?: string;
}) {
  return <span className={className}>{formatMinorUnits(amountMinorUnits, currency)}</span>;
}
