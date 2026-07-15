import type { HttpClient } from '@work/http-client';

export type PresenceFormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'single_select'
  | 'multi_select'
  | 'file'
  | 'image'
  | 'employee';

export interface FormsDefinitionMirror {
  revision: number;
  fields: Array<{
    fieldKey: string;
    label: string;
    fieldType: PresenceFormFieldType;
    required: boolean;
    description?: string;
    sortOrder: number;
    options?: Array<{ key: string; label: string }>;
    status: 'active' | 'disabled';
  }>;
}

export interface PresenceFormsMirror {
  getPresenceStatusDefinition(key: string): Promise<FormsDefinitionMirror>;
}

export function createPresenceFormsMirror(http: HttpClient): PresenceFormsMirror {
  return {
    getPresenceStatusDefinition(key) {
      return http.get<FormsDefinitionMirror>(
        `definitions/presence.status.${encodeURIComponent(key)}`,
      );
    },
  };
}
