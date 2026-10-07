import { useState, useRef, useCallback } from 'react';
import { NotificationItem } from '../components/Notification';

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const notificationCounter = useRef(0);

  const addNotification = useCallback((type: NotificationItem['type'], message: string) => {
    notificationCounter.current += 1;
    const id = `${Date.now()}-${notificationCounter.current}`;
    setNotifications(prev => [...prev, { id, type, message }]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return { notifications, addNotification, removeNotification };
}
