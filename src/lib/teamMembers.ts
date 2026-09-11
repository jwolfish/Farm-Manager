import { supabase } from './supabase';
import type { Database } from './database.types';

export type TeamRole = 'editor' | 'viewer';
export type InvitationStatus = Database['public']['Tables']['team_members']['Row']['status'];

export interface TeamMember {
  id: string;
  email: string;
  role: TeamRole;
  status: InvitationStatus;
  invitedAt: string;
  acceptedAt: string | null;
  invitedUserId: string | null;
}

export interface SharedFarm {
  invitationId: string;
  farmId: string;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string;
  farmName: string | null;
  role: TeamRole;
}

export interface AppNotification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
  senderUserId: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/*
 * `ownerName`, `ownerEmail` and `farmName` used to be parameters here, solely to build
 * the notification payload client-side. `link_invitation_to_account` now builds it in
 * SQL from `user_profiles` and `farms`, which is both truthful (the database's own names
 * rather than whatever the caller passed) and identical to what the signup trigger
 * produces — the two paths share one body. They are dropped rather than left unused.
 */
export async function sendInvitation(
  ownerUserId: string,
  farmId: string,
  invitedEmail: string,
  role: TeamRole
): Promise<{ error: string | null }> {
  const trimmedEmail = invitedEmail.trim().toLowerCase();

  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return { error: 'Please enter a valid email address.' };
  }

  const { data: existingMember } = await supabase
    .from('team_members')
    .select('id, status')
    .eq('user_id', ownerUserId)
    .eq('farm_id', farmId)
    .eq('email', trimmedEmail)
    .maybeSingle();

  if (existingMember) {
    if (existingMember.status === 'accepted') {
      return { error: 'This person already has access to this farm.' };
    }
    if (existingMember.status === 'pending') {
      return { error: 'An invitation is already pending for this email.' };
    }
  }

  const { data: inviteRecord, error: inviteError } = await supabase
    .from('team_members')
    .insert({
      user_id: ownerUserId,
      farm_id: farmId,
      email: trimmedEmail,
      role,
      status: 'pending',
    })
    .select('id')
    .single();

  if (inviteError) {
    console.error('Error creating invitation:', inviteError);
    if (inviteError.code === '23505') {
      return { error: 'This person already has a pending or active invitation to this farm.' };
    }
    return { error: 'Failed to send invitation. Please try again.' };
  }

  /*
   * Link the invitation to an existing account, if the invitee already has one.
   *
   * This USED to read `user_profiles` directly and link it here. That query returns
   * ZERO ROWS for anyone who is not already a collaborator, because the RLS policy on
   * `user_profiles` is "you, or someone who owns a farm you can view" — and a new
   * account owns only its own default farm, which the inviter cannot view. The branch
   * was therefore skipped silently, and the invitation could never be accepted: with
   * `invited_user_id` NULL the invitee cannot SEE the row, so it never reaches their
   * Team page. Same shape as the `fetchSharedFarms` defect — an RLS-empty result read
   * as a fact rather than as "I cannot see".
   *
   * `link_invitation_to_account` is SECURITY DEFINER so it can resolve the address
   * against `auth.users` without exposing profiles, and it re-checks that the caller
   * owns the invitation so it cannot be used to probe whether an address has an
   * account. It shares one body with the signup trigger, so invite-then-signup and
   * signup-then-invite cannot drift into meaning different things.
   *
   * `false` is the ordinary "no account yet" answer, not a failure — the signup
   * trigger links it when they register. A real error is surfaced, because a silently
   * discarded one is what let this run broken.
   */
  const { error: linkError } = await supabase.rpc('link_invitation_to_account', {
    p_invitation_id: inviteRecord.id,
  });

  if (linkError) {
    console.error('Error linking invitation to an existing account:', linkError);
    return {
      error:
        'The invitation was created, but linking it to an existing account failed. ' +
        'If they already have an account, ask them to sign out and back in.',
    };
  }

  return { error: null };
}

export async function fetchSentInvitations(ownerUserId: string, farmId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('id, email, role, status, invited_at, accepted_at, invited_user_id')
    .eq('user_id', ownerUserId)
    .eq('farm_id', farmId)
    .order('invited_at', { ascending: false });

  if (error) {
    console.error('Error fetching invitations:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as TeamRole,
    status: row.status,
    invitedAt: row.invited_at ?? '',
    acceptedAt: row.accepted_at,
    invitedUserId: row.invited_user_id,
  }));
}

export async function fetchSharedFarms(userId: string): Promise<SharedFarm[]> {
  // The owner's profile is fetched separately, NOT embedded. `team_members.user_id`
  // has a foreign key to auth.users, not to user_profiles, so asking PostgREST for
  // `user_profiles!team_members_user_id_fkey` names a constraint that points at a
  // different table. That relationship cannot resolve: the request errored, this
  // function swallowed it and returned [], and so no shared farm ever appeared for
  // anyone. `farms(farm_name)` below is a genuine foreign key and embeds fine.
  const { data, error } = await supabase
    .from('team_members')
    .select('id, user_id, role, farm_id, farms(farm_name)')
    .eq('invited_user_id', userId)
    .eq('status', 'accepted');

  if (error) {
    console.error('Error fetching shared farms:', error);
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ownerIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: owners, error: ownersError } = await supabase
    .from('user_profiles')
    .select('id, email, full_name')
    .in('id', ownerIds);

  if (ownersError) {
    // The farm is still usable without the owner's name, so carry on.
    console.error('Error fetching farm owner profiles:', ownersError);
  }

  const ownerById = new Map(
    (owners ?? []).map((owner) => [owner.id, owner as { id: string; email: string; full_name: string | null }])
  );

  return rows.map((row) => {
    const farms = row.farms as { farm_name: string } | null;
    const owner = ownerById.get(row.user_id);
    return {
      invitationId: row.id,
      farmId: row.farm_id ?? '',
      ownerId: row.user_id,
      ownerName: owner?.full_name ?? null,
      ownerEmail: owner?.email ?? '',
      farmName: farms?.farm_name ?? null,
      role: row.role as TeamRole,
    };
  });
}

export async function acceptInvitation(
  notificationId: string,
  invitationId: string
): Promise<{ error: string | null }> {
  const { error: updateError } = await supabase.rpc('respond_to_invitation', {
    p_invitation_id: invitationId,
    p_accept: true,
  });

  if (updateError) {
    console.error('Error accepting invitation:', updateError);
    return { error: 'Failed to accept invitation.' };
  }

  await supabase
    .from('app_notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  return { error: null };
}

export async function declineInvitation(
  notificationId: string,
  invitationId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('respond_to_invitation', {
    p_invitation_id: invitationId,
    p_accept: false,
  });

  if (error) {
    console.error('Error declining invitation:', error);
    return { error: 'Failed to decline invitation.' };
  }

  await supabase
    .from('app_notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  return { error: null };
}

export async function revokeAccess(invitationId: string, ownerUserId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', invitationId)
    .eq('user_id', ownerUserId);

  if (error) {
    console.error('Error revoking access:', error);
    return { error: 'Failed to revoke access.' };
  }

  return { error: null };
}

export async function fetchUnreadNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('app_notifications')
    .select('id, type, payload, is_read, created_at, sender_user_id')
    .eq('recipient_user_id', userId)
    .eq('is_read', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    type: row.type,
    payload: row.payload as Record<string, unknown>,
    isRead: row.is_read,
    createdAt: row.created_at,
    senderUserId: row.sender_user_id,
  }));
}

export async function dismissNotification(notificationId: string): Promise<void> {
  await supabase
    .from('app_notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
}
