export const notificationEvents = {
  notificationCreated: 'notification.created',
} as const;

export const notificationTriggerKeys = {
  // Creating a status/activity note for a person must not notify that same person.
  // Do not add an activity-note trigger unless the product decision changes.
  presenceStatusChanged: 'presence.status.changed',
  // profile.updated is owned by @work/platform-contract (platformEvents.profileUpdated);
  // notification subscribes via that constant. It is NOT a configurable trigger:
  // it always notifies the subject directly (no RecipientResolver, no trigger_config).
} as const;
