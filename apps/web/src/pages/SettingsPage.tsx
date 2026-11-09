import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api.js';
import { tenants } from '../lib/api.js';
import { SESSION_QUERY_KEY, useAuth } from '../lib/auth-context.js';

function HouseholdSection() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');

  const membersQuery = useQuery({ queryKey: ['tenant-members'], queryFn: tenants.listMembers });
  const sentInvitesQuery = useQuery({
    queryKey: ['tenant-sent-invites'],
    queryFn: tenants.listSentInvites,
    enabled: role === 'owner',
  });
  const auditLogQuery = useQuery({
    queryKey: ['tenant-audit-log'],
    queryFn: tenants.listAuditLog,
    enabled: role === 'owner',
  });

  function invalidateHousehold() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tenant-members'] }),
      queryClient.invalidateQueries({ queryKey: ['tenant-sent-invites'] }),
      queryClient.invalidateQueries({ queryKey: ['tenant-audit-log'] }),
    ]);
  }

  const inviteMutation = useMutation({
    mutationFn: tenants.invite,
    onSuccess: () => {
      setInviteEmail('');
      return invalidateHousehold();
    },
  });
  const revokeInviteMutation = useMutation({
    mutationFn: tenants.revokeInvite,
    onSuccess: invalidateHousehold,
  });
  const removeMemberMutation = useMutation({
    mutationFn: tenants.removeMember,
    onSuccess: invalidateHousehold,
  });
  const navigate = useNavigate();
  const leaveMutation = useMutation({
    mutationFn: tenants.leave,
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      navigate('/overview');
    },
  });

  const members = membersQuery.data ?? [];
  const sentInvites = (sentInvitesQuery.data ?? []).filter((invite) => invite.status === 'pending');
  const auditLog = auditLogQuery.data ?? [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-700">Household</h2>
      <p className="mt-1 text-sm text-slate-500">
        Invite someone to share this budget with you. Records stay private unless you explicitly
        mark them visible to the tenant or to specific members.
      </p>

      <ul className="mt-4 divide-y divide-slate-200 rounded-md border border-slate-200">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between gap-4 p-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{member.name ?? member.email}</p>
              <p className="text-xs text-slate-500">
                {member.email} &middot; {member.role}
              </p>
            </div>
            {role === 'owner' && member.role !== 'owner' && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Remove ${member.email} from this tenant?`)) {
                    removeMemberMutation.mutate(member.userId);
                  }
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {role === 'owner' && (
        <>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (inviteEmail.trim()) {
                inviteMutation.mutate(inviteEmail.trim());
              }
            }}
          >
            <input
              type="email"
              required
              placeholder="partner@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={inviteMutation.isPending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Invite
            </button>
          </form>

          {sentInvites.length > 0 && (
            <ul className="mt-3 space-y-1">
              {sentInvites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex items-center justify-between gap-4 text-sm text-slate-600"
                >
                  <span>{invite.invitedEmail} &middot; pending</span>
                  <button
                    type="button"
                    onClick={() => revokeInviteMutation.mutate(invite.id)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}

          {auditLog.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Activity
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                {auditLog.map((event) => (
                  <li key={event.id}>
                    {new Date(event.createdAt).toLocaleString()} &middot;{' '}
                    {event.action.replaceAll('_', ' ')}
                    {event.targetEmail ? ` (${event.targetEmail})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {role === 'member' && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Leave this tenant? You will lose access to its shared records.')) {
              leaveMutation.mutate();
            }
          }}
          className="mt-4 rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Leave this tenant
        </button>
      )}
    </section>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      'This permanently deletes your account and all of your income, expense, and account records. This cannot be undone. If you still own a tenant shared with other members, remove them first. Continue?',
    );
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      await api.deleteCurrentUserAccount();
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      navigate('/login');
    } catch (error) {
      window.alert(error instanceof api.ApiError ? error.message : 'Something went wrong.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>

      <HouseholdSection />

      <section className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h2 className="text-sm font-semibold text-red-900">Delete account</h2>
        <p className="mt-1 text-sm text-red-700">
          Permanently deletes your account and all of your income, expense, and account records.
          This cannot be undone. If you own a tenant that still has other members, remove them
          first.
        </p>
        <button
          type="button"
          onClick={() => void handleDeleteAccount()}
          disabled={isDeleting}
          className="mt-4 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          {isDeleting ? 'Deleting…' : 'Delete my account'}
        </button>
      </section>
    </div>
  );
}
