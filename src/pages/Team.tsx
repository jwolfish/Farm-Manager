import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFarm } from '../contexts/FarmContext';
import {
  sendInvitation,
  fetchSentInvitations,
  revokeAccess,
  TeamMember,
  TeamRole,
  SharedFarm,
} from '../lib/teamMembers';
import {
  Users,
  UserPlus,
  Trash2,
  ExternalLink,
  ArrowLeft,
  Check,
  Clock,
  X,
  ChevronDown,
  Tractor,
} from 'lucide-react';

interface TeamProps {
  onSwitchToFarm: (farm: SharedFarm) => void;
  onSwitchToOwnFarm: () => void;
  sharedFarms: SharedFarm[];
  onRefreshSharedFarms: () => void;
}

const roleLabels: Record<TeamRole, string> = {
  editor: 'Editor',
  viewer: 'Viewer',
};

const roleDescriptions: Record<TeamRole, string> = {
  editor: 'Can view and edit data',
  viewer: 'Can view data only',
};

export function Team({ onSwitchToFarm, onSwitchToOwnFarm, sharedFarms, onRefreshSharedFarms }: TeamProps) {
  const { user } = useAuth();
  const { activeFarm } = useFarm();
  const [invitations, setInvitations] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('viewer');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  const activeFarmId = activeFarm?.farmId ?? null;
  const activeFarmName = activeFarm?.farmName ?? null;

  useEffect(() => {
    if (!user || !activeFarmId) return;
    loadData();
  }, [user, activeFarmId]);

  const loadData = async () => {
    if (!user || !activeFarmId) return;
    setLoading(true);
    const data = await fetchSentInvitations(user.id, activeFarmId);
    setInvitations(data);
    onRefreshSharedFarms();
    setLoading(false);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !inviteEmail.trim() || !activeFarmId) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const { error: err } = await sendInvitation(
      user.id,
      activeFarmName ?? user.email ?? 'Unknown',
      user.email ?? '',
      activeFarmId,
      activeFarmName,
      inviteEmail.trim(),
      inviteRole
    );

    if (err) {
      setError(err);
    } else {
      setSuccess(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
      loadData();
    }
    setSubmitting(false);
  };

  const handleRevoke = async (memberId: string) => {
    if (!user) return;
    await revokeAccess(memberId, user.id);
    setRevokeConfirm(null);
    loadData();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
            <Check className="w-3 h-3" />
            Accepted
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case 'declined':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
            <X className="w-3 h-3" />
            Declined
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <p className="text-gray-500 mt-1 text-sm">Share your farm with collaborators or access farms shared with you</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-green-600" />
            <h2 className="text-base font-semibold text-gray-900">Invite Collaborator</h2>
          </div>
          {activeFarmName && (
            <p className="text-xs text-gray-500 mt-0.5">
              Granting access to all seasons in{' '}
              <span className="font-medium text-gray-700">{activeFarmName}</span>
            </p>
          )}
          {!activeFarmId && (
            <p className="text-xs text-amber-600 mt-1">Select a farm first to manage collaborators.</p>
          )}
        </div>

        <form onSubmit={handleInvite} className="px-6 py-5">
          <div className="flex gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="collaborator@example.com"
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
              disabled={!activeFarmId}
            />

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowRoleDropdown((v) => !v)}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                disabled={!activeFarmId}
              >
                {roleLabels[inviteRole]}
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {showRoleDropdown && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
                  {(Object.keys(roleLabels) as TeamRole[]).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        setInviteRole(role);
                        setShowRoleDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                        inviteRole === role ? 'bg-green-50 text-green-700' : 'text-gray-700'
                      }`}
                    >
                      <div className="font-medium">{roleLabels[role]}</div>
                      <div className={`text-xs ${inviteRole === role ? 'text-green-600' : 'text-gray-500'}`}>{roleDescriptions[role]}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || !activeFarmId}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send Invite'}
            </button>
          </div>

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {success && <p className="mt-2 text-sm text-green-600">{success}</p>}
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-600" />
            <h2 className="text-base font-semibold text-gray-900">People With Access</h2>
          </div>
          {activeFarmName && (
            <p className="text-xs text-gray-500 mt-0.5">
              Access to all seasons in <span className="font-medium text-gray-700">{activeFarmName}</span>
            </p>
          )}
        </div>

        {loading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">Loading...</div>
        ) : !activeFarmId ? (
          <div className="px-6 py-8 text-center">
            <Tractor className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Select a farm to manage its collaborators.</p>
          </div>
        ) : invitations.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No collaborators yet. Invite someone to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {invitations.map((member) => (
              <div key={member.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{member.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusBadge(member.status)}
                    <span className="text-xs text-gray-400 capitalize">{roleLabels[member.role]}</span>
                  </div>
                </div>
                {revokeConfirm === member.id ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-600">Remove access?</span>
                    <button
                      onClick={() => handleRevoke(member.id)}
                      className="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Remove
                    </button>
                    <button
                      onClick={() => setRevokeConfirm(null)}
                      className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setRevokeConfirm(member.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                    title="Remove access"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {sharedFarms.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-amber-600" />
              <h2 className="text-base font-semibold text-gray-900">Farms I Have Access To</h2>
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {sharedFarms.map((farm) => (
              <div key={farm.invitationId} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {farm.farmName ?? farm.ownerEmail ?? 'Unknown Farm'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">{roleLabels[farm.role]}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSwitchToFarm(farm)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View farm
                  </button>
                  <button
                    onClick={onSwitchToOwnFarm}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    My farm
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
