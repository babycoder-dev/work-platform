import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  PLATFORM_DATA_TYPES,
  type CreateRoleInput,
  type DataScope,
  type PermissionDto,
  type PlatformDataType,
  type RoleDataScope,
  type RoleDto,
  type UpdateRoleInput,
} from '@work/platform-contract';
import { getPlatformCurrentUser, getPlatformRolesApi } from '../runtime';

const EDITABLE_DATA_SCOPES = ['self', 'department', 'department_tree', 'company'] as const satisfies readonly DataScope[];

const DATA_TYPE_LABELS: Record<PlatformDataType, string> = {
  profile: '个人信息档案',
  presence: '在位状态',
  report: '日报周报',
};

const DATA_SCOPE_LABELS: Record<(typeof EDITABLE_DATA_SCOPES)[number], string> = {
  self: '本人',
  department: '本部门',
  department_tree: '本部门及下级',
  company: '全公司',
};

interface FormState {
  code: string;
  name: string;
  description: string;
  status: RoleDto['status'];
  permissionCodes: string[];
  dataScopes: Record<PlatformDataType, (typeof EDITABLE_DATA_SCOPES)[number]>;
}

interface RoleEditorProps {
  role?: RoleDto;
  onCancel(): void;
  onSaved(role: RoleDto): void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; permissions: PermissionDto[] }
  | { kind: 'error'; message: string };

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

export function RoleEditor(props: RoleEditorProps) {
  const [form, setForm] = useState<FormState>(() => makeInitialForm(props.role));
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });

  useEffect(() => {
    let active = true;
    void getPlatformRolesApi()
      .listPermissions()
      .then((permissions) => {
        if (active) {
          setLoadState({ kind: 'ready', permissions });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadState({ kind: 'error', message: readError(error) });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const permissionGroups = useMemo(() => {
    if (loadState.kind !== 'ready') {
      return [];
    }
    const groups = new Map<string, PermissionDto[]>();
    for (const permission of loadState.permissions) {
      const permissions = groups.get(permission.moduleName) ?? [];
      permissions.push(permission);
      groups.set(permission.moduleName, permissions);
    }
    return Array.from(groups, ([moduleName, permissions]) => ({ moduleName, permissions }));
  }, [loadState]);

  function setTextField(field: 'code' | 'name' | 'description') {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  function togglePermission(code: string) {
    setForm((current) => ({
      ...current,
      permissionCodes: current.permissionCodes.includes(code)
        ? current.permissionCodes.filter((permissionCode) => permissionCode !== code)
        : [...current.permissionCodes, code],
    }));
  }

  function setDataScope(dataType: PlatformDataType, scope: (typeof EDITABLE_DATA_SCOPES)[number]) {
    setForm((current) => ({
      ...current,
      dataScopes: { ...current.dataScopes, [dataType]: scope },
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || (!props.role && !form.code.trim())) {
      setSubmitState({ kind: 'error', message: '请填写角色名称和 code。' });
      return;
    }

    setSubmitState({ kind: 'submitting' });
    try {
      const dataScopes = PLATFORM_DATA_TYPES.map((dataType): RoleDataScope => ({
        dataType,
        scope: form.dataScopes[dataType],
      }));
      const role = props.role
        ? await getPlatformRolesApi().updateRole(props.role.id, {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            permissionCodes: form.permissionCodes,
            dataScopes,
            status: form.status,
          } satisfies UpdateRoleInput)
        : await getPlatformRolesApi().createRole({
            enterpriseId: getPlatformCurrentUser().enterpriseId,
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            permissionCodes: form.permissionCodes,
            dataScopes,
          } satisfies CreateRoleInput);
      props.onSaved(role);
    } catch (error) {
      setSubmitState({ kind: 'error', message: readError(error) });
    }
  }

  return (
    <section className="platform-role-editor">
      <h3>{props.role ? `编辑角色：${props.role.name}` : '新建角色'}</h3>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          名称
          <input onChange={setTextField('name')} value={form.name} />
        </label>
        <label>
          code
          <input disabled={Boolean(props.role)} onChange={setTextField('code')} value={form.code} />
        </label>
        <label>
          描述
          <textarea onChange={setTextField('description')} rows={3} value={form.description} />
        </label>
        <label>
          状态
          <select
            onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as RoleDto['status'] }))}
            value={form.status}
          >
            <option value="active">启用</option>
            <option value="disabled">停用</option>
          </select>
        </label>

        <section>
          <h4>功能权限矩阵</h4>
          {loadState.kind === 'loading' ? <p>权限加载中…</p> : null}
          {loadState.kind === 'error' ? <p className="platform-role-editor__error">{loadState.message}</p> : null}
          {loadState.kind === 'ready' && permissionGroups.length === 0 ? <p>暂无权限点。</p> : null}
          {permissionGroups.map((group) => (
            <fieldset key={group.moduleName}>
              <legend>{group.moduleName}</legend>
              {group.permissions.map((permission) => (
                <label key={permission.code}>
                  <input
                    checked={form.permissionCodes.includes(permission.code)}
                    onChange={() => togglePermission(permission.code)}
                    type="checkbox"
                  />
                  {permission.name}
                </label>
              ))}
            </fieldset>
          ))}
        </section>

        <section>
          <h4>数据范围矩阵</h4>
          <table>
            <thead>
              <tr>
                <th>数据类型</th>
                {EDITABLE_DATA_SCOPES.map((scope) => (
                  <th key={scope}>{DATA_SCOPE_LABELS[scope]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLATFORM_DATA_TYPES.map((dataType) => (
                <tr key={dataType}>
                  <th>{DATA_TYPE_LABELS[dataType]}</th>
                  {EDITABLE_DATA_SCOPES.map((scope) => (
                    <td key={scope}>
                      <input
                        aria-label={`${DATA_TYPE_LABELS[dataType]}-${DATA_SCOPE_LABELS[scope]}`}
                        checked={form.dataScopes[dataType] === scope}
                        name={`data-scope-${dataType}`}
                        onChange={() => setDataScope(dataType, scope)}
                        type="radio"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {submitState.kind === 'error' ? <p className="platform-role-editor__error">{submitState.message}</p> : null}
        <button disabled={submitState.kind === 'submitting' || loadState.kind !== 'ready'} type="submit">
          {submitState.kind === 'submitting' ? '保存中…' : '保存'}
        </button>
        <button onClick={props.onCancel} type="button">
          取消
        </button>
      </form>
    </section>
  );
}

function makeInitialForm(role?: RoleDto): FormState {
  const dataScopes: FormState['dataScopes'] = {
    profile: 'self',
    presence: 'self',
    report: 'self',
  };
  for (const item of role?.dataScopes ?? []) {
    if (item.scope !== 'custom') {
      dataScopes[item.dataType] = item.scope;
    }
  }
  return {
    code: role?.code ?? '',
    name: role?.name ?? '',
    description: role?.description ?? '',
    status: role?.status ?? 'active',
    permissionCodes: role?.permissionCodes ?? [],
    dataScopes,
  };
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : '保存角色失败';
}
