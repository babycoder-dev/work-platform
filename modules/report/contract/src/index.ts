export const reportPermissions = {
  dailyCreate: 'report:daily:create',
  weeklyCreate: 'report:weekly:create',
  weeklyView: 'report:weekly:view',
} as const;

export const reportEvents = {
  weeklySubmitted: 'report.weekly.submitted',
} as const;
