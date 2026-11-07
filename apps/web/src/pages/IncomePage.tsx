import { income } from '../lib/api.js';
import { RecurringItemsPage } from '../components/RecurringItemsPage.js';

export function IncomePage() {
  return (
    <RecurringItemsPage
      title="Income"
      queryKey="income"
      api={income}
      emptyStateTitle="No income sources yet"
      emptyStateDescription="Add your salary, freelance income, or anything else you regularly receive."
    />
  );
}
