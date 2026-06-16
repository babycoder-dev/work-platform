import { notificationEvents } from '@work/notification-contract';

export const notificationStreamEventTypes = {
  created: notificationEvents.notificationCreated,
  keepalive: 'keepalive',
} as const;
