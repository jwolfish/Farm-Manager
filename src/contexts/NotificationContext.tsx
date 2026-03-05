import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  taskId?: string;
  createdAt: number;
}

interface NotificationActionsContextType {
  addNotification: (message: string, type: Notification['type'], taskId?: string) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

interface NotificationListContextType {
  notifications: Notification[];
}

const NotificationActionsContext = createContext<NotificationActionsContextType | undefined>(undefined);
const NotificationListContext = createContext<NotificationListContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((
    message: string,
    type: Notification['type'],
    taskId?: string
  ) => {
    const id = Math.random().toString(36).substring(7);
    const notification: Notification = {
      id,
      message,
      type,
      taskId,
      createdAt: Date.now()
    };

    setNotifications(prev => [...prev, notification]);

    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 5000);
    } else if (type === 'info') {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 3000);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const actions = useMemo(() => ({
    addNotification,
    removeNotification,
    clearAll,
  }), [addNotification, removeNotification, clearAll]);

  const listValue = useMemo(() => ({ notifications }), [notifications]);

  return (
    <NotificationActionsContext.Provider value={actions}>
      <NotificationListContext.Provider value={listValue}>
        {children}
      </NotificationListContext.Provider>
    </NotificationActionsContext.Provider>
  );
}

export function useNotifications(): NotificationActionsContextType {
  const context = useContext(NotificationActionsContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}

export function useNotificationList(): NotificationListContextType {
  const context = useContext(NotificationListContext);
  if (!context) {
    throw new Error('useNotificationList must be used within NotificationProvider');
  }
  return context;
}
