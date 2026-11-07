import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth-context.js';

export function ProtectedRoute() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
