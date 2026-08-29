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

export async function sendInvitation(
  ownerUserId: string,
  ownerName: string,
  ownerEmail: string,
  farmId: string,
  farmName: string | null,
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

  const { data: invitedProfile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', trimmedEmail)
    .maybeSingle();

  if (invitedProfile?.id) {
    await supabase
      .from('team_members')
      .update({ invited_user_id: invitedProfile.id })
      .eq('id', inviteRecord.id);

    await supabase
      .from('app_notifications')
      .insert({
        recipient_user_id: invitedProfile.id,
        sender_user_id: ownerUserId,
        type: 'team_invite',
        payload: {
          invitation_id: inviteRecord.id,
          farm_id: farmId,
          owner_name: ownerName || ownerEmail,
          owner_email: ownerEmail,
          farm_name: farmName,
          role,
        },
        is_read: false,
      });
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
  const { data, error } = await supabase
    .from('team_members')
    .select('id, user_id, role, farm_id, farms(farm_name), owner_profile:user_profiles!team_members_user_id_fkey(email)')
    .eq('invited_user_id', userId)
    .eq('status', 'accepted');

  if (error) {
    console.error('Error fetching shared farms:', error);
    return [];
  }

  return (data || []).map((row) => {
    const farms = row.farms as { farm_name: string } | null;
    const ownerProfile = row.owner_profile as { email: string } | null;
    return {
      invitationId: row.id,
      farmId: row.farm_id ?? '',
      ownerId: row.user_id,
      ownerName: null,
      ownerEmail: ownerProfile?.email ?? '',
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
