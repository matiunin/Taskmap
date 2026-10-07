import React, { useEffect, useState } from 'react';
import './Notification.css';

export interface NotificationItem {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

interface NotificationProps {
  notifications: NotificationItem[];
  onRemove: (id: string) => void;
}

export const Notification: React.FC<NotificationProps> = ({ notifications, onRemove }) => {
  return (
    <div className="notifications-container">
      {notifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
};

const NotificationToast: React.FC<{
  notification: NotificationItem;
  onRemove: (id: string) => void;
}> = ({ notification, onRemove }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [progress, setProgress] = useState(100); // Прогресс таймера в процентах

  const isError = notification.type === 'error';
  
  // Время автоскрытия: 30 сек для ошибок, 3 сек для остальных
  const autoHideTime = isError ? 30000 : 3000;

  useEffect(() => {
    // Появление
    requestAnimationFrame(() => setIsVisible(true));

    // Анимация прогресса
    const startTime = Date.now();
    const updateInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / autoHideTime) * 100);
      setProgress(remaining);
    }, 50);

    // Автоскрытие
    const hideTimer = setTimeout(() => {
      setIsLeaving(true);
    }, autoHideTime);

    // Удаление после анимации
    const removeTimer = setTimeout(() => {
      onRemove(notification.id);
    }, autoHideTime + 300);

    return () => {
      clearInterval(updateInterval);
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [notification.id, onRemove, autoHideTime]);

  // Закрытие по клику
  const handleClick = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onRemove(notification.id);
    }, 300);
  };

  const icon = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  }[notification.type];

  return (
    <div
      className={`notification-toast ${notification.type} ${isVisible ? 'visible' : ''} ${isLeaving ? 'leaving' : ''} ${isError ? 'persistent' : ''}`}
      onClick={handleClick}
      title="Нажмите чтобы закрыть"
    >
      <span className="notification-icon">{icon}</span>
      <span className="notification-message">{notification.message}</span>
      {isError && <span className="notification-close">×</span>}
      {/* Полоска таймера */}
      <div 
        className="notification-progress"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};
