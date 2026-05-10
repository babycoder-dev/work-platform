export interface ImUserProfile {
  userId: string;
  nickname: string;
  faceUrl?: string;
}

export interface SendSystemMessageInput {
  toUserIds: string[];
  title: string;
  content: string;
  sourceModule?: string;
  sourceId?: string;
}

export interface SendSystemMessageResult {
  providerMessageId?: string;
  acceptedUserIds: string[];
}

export interface ImWebhookEvent {
  provider: 'openim' | string;
  eventType: string;
  eventId?: string;
  occurredAt?: string;
  payload: unknown;
}
