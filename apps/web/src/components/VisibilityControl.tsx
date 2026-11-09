import { useQuery } from '@tanstack/react-query';
import type { Visibility } from '@quidsin/core';
import { tenants } from '../lib/api.js';

/**
 * Only rendered at all once the current tenant actually has more than one
 * member — with a solo tenant, visibility is moot and the control would
 * just be clutter.
 */
export function VisibilityControl({
  visibility,
  sharedWithUserIds,
  onChange,
}: {
  visibility: Visibility;
  sharedWithUserIds?: string[];
  onChange: (visibility: Visibility, sharedWithUserIds?: string[]) => void;
}) {
  const membersQuery = useQuery({ queryKey: ['tenant-members'], queryFn: tenants.listMembers });
  const members = membersQuery.data ?? [];

  if (members.length <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={visibility}
        onChange={(e) => onChange(e.target.value as Visibility, sharedWithUserIds)}
        className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-600"
      >
        <option value="private">Private</option>
        <option value="tenant">Everyone</option>
        <option value="shared">Shared with…</option>
      </select>
      {visibility === 'shared' && (
        <select
          multiple
          value={sharedWithUserIds ?? []}
          onChange={(e) =>
            onChange('shared', Array.from(e.target.selectedOptions).map((option) => option.value))
          }
          className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-600"
        >
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name ?? member.email}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
