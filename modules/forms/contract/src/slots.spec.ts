import { describe, expect, it } from 'vitest';
import { formsPermissions } from './permissions';
import { resolveActiveFormSlot } from './slots';

describe('form slot registry', () => {
  it('activates presence status slots with presence data scope and permission constants', () => {
    expect(resolveActiveFormSlot('presence.status.business_trip')).toEqual(
      expect.objectContaining({
        slotKey: 'presence.status.business_trip',
        ownerModule: 'presence',
        status: 'active',
        cardinality: 'append',
        dataType: 'presence',
        subjectType: 'employee',
        permissions: {
          view: formsPermissions.presenceDefinitionView,
          manage: formsPermissions.presenceDefinitionManage,
        },
      }),
    );
  });
});
