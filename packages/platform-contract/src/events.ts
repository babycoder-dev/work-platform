export const platformEvents = {
  profileUpdated: 'profile.updated',
} as const;

export interface ProfileUpdatedPayload {
  enterpriseId: string;
  subjectUserId: string;
  changedBy: string;
  changedFields: string[];
}
