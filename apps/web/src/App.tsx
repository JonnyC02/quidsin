import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute.js';
import { PublicOnlyRoute } from './routes/PublicOnlyRoute.js';
import { AppShell } from './components/AppShell.js';
import { PublicShell } from './components/PublicShell.js';
import { LoginPage } from './pages/LoginPage.js';
import { OverviewPage } from './pages/OverviewPage.js';
import { IncomePage } from './pages/IncomePage.js';
import { ExpensesPage } from './pages/ExpensesPage.js';
import { AccountsPage } from './pages/AccountsPage.js';
import { TransactionsPage } from './pages/TransactionsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/overview" replace />} />

      <Route element={<PublicOnlyRoute />}>
        <Route element={<PublicShell />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/income" element={<IncomePage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
