import { useEffect, useRef, useState } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchUnreadNotifications,
  dismissNotification,
  acceptInvitation,
  declineInvitation,
  AppNotification,
} from '../lib/teamMembers';

interface NotificationBellProps {
  onInviteAccepted: () => void;
}

export function NotificationBell({ onInviteAccepted }: NotificationBellProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!user) return;
    const data = await fetchUnreadNotifications(user.id);
    setNotifications(data);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleAccept = async (notification: AppNotification) => {
    if (!user) return;
    const payload = notification.payload as { invitation_id: string; owner_name?: string; farm_name?: string };
    setProcessing(notification.id);
    const { error } = await acceptInvitation(notification.id, payload.invitation_id, user.id);
    if (!error) {
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
      onInviteAccepted();
    }
    setProcessing(null);
  };

  const handleDecline = async (notification: AppNotification) => {
    const payload = notification.payload as { invitation_id: string };
    setProcessing(notification.id);
    await declineInvitation(notification.id, payload.invitation_id);
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    setProcessing(null);
  };

  const handleDismiss = async (notificationId: string) => {
    await dismissNotification(notificationId);
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  };

  const unreadCount = notifications.length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">No new notifications</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {notifications.map((notification) => {
                const payload = notification.payload as {
                  invitation_id?: string;
                  owner_name?: string;
                  farm_name?: string;
                  role?: string;
                };
                const isInvite = notification.type === 'team_invite';
                const isProcessing = processing === notification.id;

                return (
                  <div key={notification.id} className="px-4 py-3">
                    {isInvite ? (
                      <div>
                        <p className="text-sm text-gray-800 mb-2">
                          <span className="font-medium">{payload.owner_name ?? 'Someone'}</span> invited you to view{' '}
                          {payload.farm_name ? (
                            <span className="font-medium">{payload.farm_name}</span>
                          ) : (
                            'their farm'
                          )}{' '}
                          as a{' '}
                          <span className="capitalize font-medium text-green-700">{payload.role ?? 'viewer'}</span>.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAccept(notification)}
                            disabled={isProcessing}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" />
                            Accept
                          </button>
                          <button
                            onClick={() => handleDecline(notification)}
                            disabled={isProcessing}
                            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                          >
                            <X className="w-3 h-3" />
                            Decline
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-700">{notification.type}</p>
                        <button
                          onClick={() => handleDismiss(notification.id)}
                          className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
