import { NavLink, Outlet } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth-context.js';
import { tenants } from '../lib/api.js';

const NAV_ITEMS = [
  { to: '/overview', label: 'Overview' },
  { to: '/income', label: 'Income' },
  { to: '/expenses', label: 'Expenses' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/settings', label: 'Settings' },
];

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return [
    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  ].join(' ');
}

function TenantSwitcher() {
  const { tenantId, switchTenant } = useAuth();
  const myTenantsQuery = useQuery({ queryKey: ['my-tenants'], queryFn: tenants.listMine });
  const items = myTenantsQuery.data ?? [];

  // Only worth showing once there's actually a choice to make.
  if (items.length <= 1) {
    return null;
  }

  return (
    <select
      value={tenantId ?? ''}
      onChange={(e) => void switchTenant(e.target.value)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
    >
      {items.map(({ tenant, role }) => (
        <option key={tenant.id} value={tenant.id}>
          {tenant.name} {role === 'owner' ? '(yours)' : '(shared with you)'}
        </option>
      ))}
    </select>
  );
}

function PendingInvitesBanner() {
  const queryClient = useQueryClient();
  const pendingQuery = useQuery({
    queryKey: ['pending-invites'],
    queryFn: tenants.listPendingInvitesForMe,
  });

  const acceptMutation = useMutation({
    mutationFn: ({ tenantId, inviteId }: { tenantId: string; inviteId: string }) =>
      tenants.acceptInvite(tenantId, inviteId),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const declineMutation = useMutation({
    mutationFn: ({ tenantId, inviteId }: { tenantId: string; inviteId: string }) =>
      tenants.declineInvite(tenantId, inviteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-invites'] }),
  });

  const invites = pendingQuery.data ?? [];
  if (invites.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2 text-sm text-amber-900"
        >
          <span>You've been invited to join a shared budget.</span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => acceptMutation.mutate({ tenantId: invite.tenantId, inviteId: invite.id })}
              className="rounded-md bg-amber-900 px-2 py-1 text-xs font-medium text-white hover:bg-amber-800"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => declineMutation.mutate({ tenantId: invite.tenantId, inviteId: invite.id })}
              className="rounded-md px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AppShell() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="text-lg font-semibold text-slate-900">QuidsIn</span>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClassName}>
                {item.label}
              </NavLink>
            ))}
            <TenantSwitcher />
            <button
              type="button"
              onClick={() => void logout()}
              className="ml-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Log out
            </button>
          </nav>
        </div>
      </header>
      <PendingInvitesBanner />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
