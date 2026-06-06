import { formsPermissions } from './permissions';

export type FormSlotStatus = 'active' | 'reserved';
export type FormRecordCardinality = 'singleton' | 'append';
export type FormDefinitionPermissionAction = 'view' | 'manage';

export type FormSlotKey =
  | 'profile.employee'
  | 'report.daily'
  | 'report.weekly'
  | `presence.status.${string}`;

export interface FormSlotDefinition {
  slotKey: FormSlotKey;
  ownerModule: 'profile' | 'presence' | 'report';
  status: FormSlotStatus;
  cardinality: FormRecordCardinality;
  permissions: Record<FormDefinitionPermissionAction, string>;
}

export const formSlotRegistry: FormSlotDefinition[] = [
  {
    slotKey: 'profile.employee',
    ownerModule: 'profile',
    status: 'active',
    cardinality: 'singleton',
    permissions: {
      view: formsPermissions.profileDefinitionView,
      manage: formsPermissions.profileDefinitionManage,
    },
  },
  {
    slotKey: 'report.daily',
    ownerModule: 'report',
    status: 'active',
    cardinality: 'append',
    permissions: {
      view: formsPermissions.reportDefinitionView,
      manage: formsPermissions.reportDefinitionManage,
    },
  },
  {
    slotKey: 'report.weekly',
    ownerModule: 'report',
    status: 'reserved',
    cardinality: 'append',
    permissions: {
      view: formsPermissions.reportDefinitionView,
      manage: formsPermissions.reportDefinitionManage,
    },
  },
];

export function resolveFormSlot(slotKey: string): FormSlotDefinition | undefined {
  const exact = formSlotRegistry.find((slot) => slot.slotKey === slotKey);
  if (exact) {
    return exact;
  }
  if (slotKey.startsWith('presence.status.') && slotKey.length > 'presence.status.'.length) {
    return {
      slotKey: slotKey as `presence.status.${string}`,
      ownerModule: 'presence',
      status: 'reserved',
      cardinality: 'append',
      permissions: {
        view: 'forms:presence-definition:view',
        manage: 'forms:presence-definition:manage',
      },
    };
  }
  return undefined;
}

export function resolveActiveFormSlot(slotKey: string): FormSlotDefinition | undefined {
  const slot = resolveFormSlot(slotKey);
  return slot?.status === 'active' ? slot : undefined;
}
