import { useCallback, useEffect, useState } from 'react';
import type { RoleDto } from '@work/platform-contract';
import { getPlatformCurrentUser, getPlatformRolesApi } from '../runtime';
import { RoleEditor } from './RoleEditor';

export default function RolesPage() {
  const currentUser = getPlatformCurrentUser();
  const canManageRoles = currentUser.permissions.some((permission) => permission.code === 'platform:role:manage');
  const canAssignRoles = currentUser.permissions.some((permission) => permission.code === 'platform:role:assign');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [editingRole, setEditingRole] = useState<RoleDto | 'new'>();
  const [message, setMessage] = useState<string>();
  const [assignment, setAssignment] = useState<AssignmentState>({
    userId: '',
    roleIds: [],
    kind: 'idle',
  });

  const reload = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', roles: await getPlatformRolesApi().listRoles() });
    } catch (error) {
      setState({ kind: 'error', message: readError(error, '加载角色列表失败') });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function deleteRole(role: RoleDto) {
    if (!window.confirm(`确认删除角色“${role.name}”？`)) {
      return;
    }
    try {
      await getPlatformRolesApi().deleteRole(role.id);
      setMessage('角色已删除。');
      await reload();
    } catch (error) {
      setMessage(readError(error, '删除角色失败'));
    }
  }

  function toggleAssignedRole(roleId: string) {
    setAssignment((current) => ({
      ...current,
      roleIds: current.roleIds.includes(roleId)
        ? current.roleIds.filter((selectedRoleId) => selectedRoleId !== roleId)
        : [...current.roleIds, roleId],
    }));
  }

  async function assignRoles() {
    if (!assignment.userId.trim()) {
      setAssignment((current) => ({ ...current, kind: 'error', message: '请填写员工 ID。' }));
      return;
    }
    setAssignment((current) => ({ ...current, kind: 'submitting' }));
    try {
      await getPlatformRolesApi().assignUserRoles(assignment.userId.trim(), assignment.roleIds);
      setAssignment((current) => ({ ...current, kind: 'success', message: '员工角色已更新。' }));
    } catch (error) {
      setAssignment((current) => ({ ...current, kind: 'error', message: readError(error, '分配角色失败') }));
    }
  }

  return (
    <section className="platform-roles">
      <header>
        <h2>角色权限</h2>
        {canManageRoles ? (
          <button onClick={() => setEditingRole('new')} type="button">
            新建角色
          </button>
        ) : null}
        <button disabled={state.kind === 'loading'} onClick={() => void reload()} type="button">
          刷新
        </button>
      </header>
      {message ? <p className="platform-roles__message">{message}</p> : null}
      {editingRole ? (
        <RoleEditor
          key={editingRole === 'new' ? 'new' : editingRole.id}
          onCancel={() => setEditingRole(undefined)}
          onSaved={() => {
            setEditingRole(undefined);
            setMessage('角色已保存。');
            void reload();
          }}
          role={editingRole === 'new' ? undefined : editingRole}
        />
      ) : null}
      {state.kind === 'loading' ? <p>加载中…</p> : null}
      {state.kind === 'error' ? <p className="platform-roles__error">{state.message}</p> : null}
      {state.kind === 'ready' && state.roles.length === 0 ? <p>暂无角色。</p> : null}
      {state.kind === 'ready' && state.roles.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>code</th>
              <th>状态</th>
              <th>类型</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {state.roles.map((role) => (
              <tr key={role.id}>
                <td>{role.name}</td>
                <td>{role.code}</td>
                <td>{role.status === 'active' ? '启用' : '停用'}</td>
                <td>{role.isSystem ? '内置' : '自定义'}</td>
                <td>
                  {canManageRoles ? (
                    <>
                      <button disabled={role.isSystem} onClick={() => setEditingRole(role)} type="button">
                        编辑
                      </button>
                      <button disabled={role.isSystem} onClick={() => void deleteRole(role)} type="button">
                        删除
                      </button>
                    </>
                  ) : (
                    <span>只读</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {canAssignRoles ? (
        <section className="platform-roles__assignment">
          <h3>给员工分配角色</h3>
          <p>按员工 ID 整组覆盖其角色。</p>
          <label>
            员工 ID
            <input
              onChange={(event) => setAssignment((current) => ({ ...current, userId: event.target.value }))}
              value={assignment.userId}
            />
          </label>
          {state.kind === 'ready'
            ? state.roles.map((role) => (
                <label key={role.id}>
                  <input
                    checked={assignment.roleIds.includes(role.id)}
                    onChange={() => toggleAssignedRole(role.id)}
                    type="checkbox"
                  />
                  {role.name}
                </label>
              ))
            : null}
          <button disabled={assignment.kind === 'submitting'} onClick={() => void assignRoles()} type="button">
            {assignment.kind === 'submitting' ? '分配中…' : '保存员工角色'}
          </button>
          {assignment.kind === 'error' || assignment.kind === 'success' ? <p>{assignment.message}</p> : null}
        </section>
      ) : null}
    </section>
  );
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; roles: RoleDto[] }
  | { kind: 'error'; message: string };

type AssignmentState = {
  userId: string;
  roleIds: string[];
} & (
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
);

function readError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
