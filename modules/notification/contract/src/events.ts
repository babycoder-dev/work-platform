export const notificationEvents = {
  notificationCreated: 'notification.created',
} as const;

export const notificationTriggerKeys = {
  // Creating a status/activity note for a person must not notify that same person.
  // Do not add an activity-note trigger unless the product decision changes.
  presenceStatusChanged: 'presence.status.changed',
  // The profile.updated producer contract belongs to @work/platform-contract.
  // This string is reserved for M8; M7-2 does not subscribe to it.
  profileUpdated: 'profile.updated',
} as const;
