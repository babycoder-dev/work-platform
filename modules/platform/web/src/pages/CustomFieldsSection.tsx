import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, EmptyState } from '@work/ui';
import type { CurrentUserDto } from '@work/platform-contract';
import type { FormDefinition, FormRecord } from '../api/forms-types';
import { getFormsApi } from '../runtime';
import { ProfileCustomFieldsForm } from './ProfileCustomFieldsForm';

type CustomState =
  | { kind: 'hidden' }
  | { kind: 'loading' }
  | { kind: 'ready'; record: FormRecord | null; message?: string }
  | { kind: 'editing'; definition: FormDefinition; record: FormRecord | null }
  | { kind: 'error'; message: string };

export function CustomFieldsSection({
  employeeId,
  currentUser,
}: {
  employeeId: string;
  currentUser: CurrentUserDto;
}) {
  const canViewRecord = hasPermission(currentUser, 'forms:record:view');
  const canEditRecord =
    hasPermission(currentUser, 'forms:record:submit') &&
    hasPermission(currentUser, 'forms:profile-definition:view');
  const [state, setState] = useState<CustomState>(
    canViewRecord ? { kind: 'loading' } : { kind: 'hidden' },
  );

  const loadRecord = useCallback(async () => {
    if (!canViewRecord) {
      setState({ kind: 'hidden' });
      return null;
    }
    setState({ kind: 'loading' });
    try {
      const record = await getFormsApi().getProfileRecord(employeeId);
      setState({ kind: 'ready', record });
      return record;
    } catch {
      setState({ kind: 'ready', record: null });
      return null;
    }
  }, [canViewRecord, employeeId]);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  async function startEditing() {
    try {
      const [definition, record] = await Promise.all([
        getFormsApi().getProfileDefinition(),
        canViewRecord
          ? getFormsApi()
              .getProfileRecord(employeeId)
              .catch(() => null)
          : null,
      ]);
      setState({ kind: 'editing', definition, record });
    } catch (error) {
      setState({ kind: 'error', message: readError(error, '加载自定义字段定义失败') });
    }
  }

  async function reloadForConflict() {
    await startEditing();
  }

  if (state.kind === 'hidden') {
    return (
      <CustomFieldsShell canEdit={canEditRecord} onEdit={() => void startEditing()}>
        <EmptyState title="暂无自定义字段记录" description="当前没有可查看的自定义字段记录。" />
      </CustomFieldsShell>
    );
  }

  if (state.kind === 'loading') {
    return <p>加载中…</p>;
  }

  if (state.kind === 'error') {
    return (
      <CustomFieldsShell canEdit={canEditRecord} onEdit={() => void startEditing()}>
        <p className="platform-employees__message platform-employees__message--error">
          {state.message}
        </p>
      </CustomFieldsShell>
    );
  }

  if (state.kind === 'editing') {
    return (
      <ProfileCustomFieldsForm
        definition={state.definition}
        employeeId={employeeId}
        onCancel={() => void loadRecord()}
        onConflictReload={reloadForConflict}
        onSaved={(record) => setState({ kind: 'ready', record, message: '已保存自定义字段' })}
        record={state.record}
      />
    );
  }

  return (
    <CustomFieldsShell canEdit={canEditRecord} onEdit={() => void startEditing()}>
      {state.message ? <p className="platform-employees__message">{state.message}</p> : null}
      <CustomValues record={state.record} />
    </CustomFieldsShell>
  );
}

function CustomFieldsShell({
  canEdit,
  children,
  onEdit,
}: {
  canEdit: boolean;
  children: ReactNode;
  onEdit: () => void;
}) {
  return (
    <div className="employee-profile__custom">
      {canEdit ? (
        <div className="employee-profile__section-actions">
          <Button onClick={onEdit} size="sm">
            编辑自定义字段
          </Button>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function CustomValues({ record }: { record: FormRecord | null }) {
  const values = useMemo(
    () =>
      (record?.values ?? [])
        .slice()
        .sort((left, right) => left.sortOrderSnapshot - right.sortOrderSnapshot),
    [record?.values],
  );
  if (values.length === 0) {
    return <EmptyState title="暂无自定义字段记录" description="该员工还没有自定义字段记录。" />;
  }
  return (
    <dl className="employee-profile__kv">
      {values.map((value) => (
        <div className="employee-profile__kv-row" key={value.fieldKey}>
          <dt>{value.fieldLabelSnapshot}</dt>
          <dd className="employee-profile__prewrap">
            {formatDisplay(value.displaySnapshot ?? value.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function formatDisplay(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(String).join('、') : '—';
  }
  if (value === undefined || value === null || value === '') {
    return '—';
  }
  return String(value);
}

function hasPermission(currentUser: CurrentUserDto, code: string): boolean {
  return currentUser.permissions.some((permission) => permission.code === code);
}

function readError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
