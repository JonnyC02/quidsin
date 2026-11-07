import { expenses } from '../lib/api.js';
import { RecurringItemsPage } from '../components/RecurringItemsPage.js';

export function ExpensesPage() {
  return (
    <RecurringItemsPage
      title="Expenses"
      queryKey="expenses"
      api={expenses}
      emptyStateTitle="No recurring expenses yet"
      emptyStateDescription="Add your rent, subscriptions, or anything else you regularly pay."
    />
  );
}
