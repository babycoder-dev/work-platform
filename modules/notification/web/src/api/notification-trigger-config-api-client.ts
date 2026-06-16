import type { HttpClient } from '@work/http-client';
import type { TriggerConfigDto, UpdateTriggerConfigInput } from '@work/notification-contract';

export interface NotificationTriggerConfigApiClient {
  listTriggerConfigs(): Promise<TriggerConfigDto[]>;
  updateTriggerConfig(triggerKey: string, input: UpdateTriggerConfigInput): Promise<TriggerConfigDto>;
}

export function createNotificationTriggerConfigApiClient(http: HttpClient): NotificationTriggerConfigApiClient {
  return {
    async listTriggerConfigs() {
      const response = await http.get<{ items: TriggerConfigDto[] }>('trigger-config');
      return response.items;
    },
    updateTriggerConfig(triggerKey, input) {
      return http.put<TriggerConfigDto, UpdateTriggerConfigInput>(
        `trigger-config/${encodeURIComponent(triggerKey)}`,
        input,
      );
    },
  };
}
