import { describe, expect, it } from 'vitest';
import { InMemoryFormsRepository } from './in-memory-forms.repository';

describe('InMemoryFormsRepository', () => {
  it('keeps definitions, fields, records, and values isolated by enterpriseId', async () => {
    const repository = new InMemoryFormsRepository();
    const definition = await repository.createDefinition({
      id: 'definition-1',
      enterpriseId: 'ent-a',
      slotKey: 'profile.employee',
      ownerModule: 'profile',
      createdBy: 'user-a',
    });
    await repository.createDefinition({
      id: 'definition-2',
      enterpriseId: 'ent-b',
      slotKey: 'profile.employee',
      ownerModule: 'profile',
      createdBy: 'user-b',
    });

    await repository.createField({
      enterpriseId: 'ent-a',
      definitionId: definition.id,
      fieldKey: 'nickname',
      label: '昵称',
      fieldType: 'text',
      required: false,
      sortOrder: 1,
    });
    const record = await repository.createRecord({
      enterpriseId: 'ent-a',
      definitionId: definition.id,
      slotKey: definition.slotKey,
      definitionRevision: definition.revision,
      subjectType: 'employee',
      subjectId: 'employee-a',
      submittedBy: 'user-a',
    });
    await repository.createRecordValue({
      enterpriseId: 'ent-a',
      recordId: record.id,
      fieldKey: 'nickname',
      fieldLabelSnapshot: '昵称',
      fieldTypeSnapshot: 'text',
      value: 'A',
      sortOrderSnapshot: 1,
    });

    await expect(repository.findDefinitionById('ent-a', definition.id)).resolves.toEqual(definition);
    await expect(repository.findDefinitionById('ent-b', definition.id)).resolves.toBeUndefined();
    await expect(repository.findDefinitionBySlotKey('ent-a', 'profile.employee')).resolves.toEqual(definition);
    await expect(repository.listFieldsByDefinitionId('ent-b', definition.id)).resolves.toEqual([]);
    await expect(repository.findRecordById('ent-b', record.id)).resolves.toBeUndefined();
    await expect(repository.listValuesByRecordId('ent-b', record.id)).resolves.toEqual([]);
  });

  it('rejects child writes when the parent belongs to another enterprise', async () => {
    const repository = new InMemoryFormsRepository();
    const definition = await repository.createDefinition({
      id: 'definition-1',
      enterpriseId: 'ent-a',
      slotKey: 'profile.employee',
      ownerModule: 'profile',
      createdBy: 'user-a',
    });
    const record = await repository.createRecord({
      enterpriseId: 'ent-a',
      definitionId: definition.id,
      slotKey: definition.slotKey,
      definitionRevision: definition.revision,
      subjectType: 'employee',
      subjectId: 'employee-a',
      submittedBy: 'user-a',
    });

    await expect(
      repository.createField({
        enterpriseId: 'ent-b',
        definitionId: definition.id,
        fieldKey: 'nickname',
        label: '昵称',
        fieldType: 'text',
        required: false,
        sortOrder: 1,
      }),
    ).rejects.toThrow('FORM_DEFINITION_NOT_FOUND');
    await expect(
      repository.createRecordValue({
        enterpriseId: 'ent-b',
        recordId: record.id,
        fieldKey: 'nickname',
        fieldLabelSnapshot: '昵称',
        fieldTypeSnapshot: 'text',
        value: 'A',
        sortOrderSnapshot: 1,
      }),
    ).rejects.toThrow('FORM_RECORD_NOT_FOUND');
  });
});
