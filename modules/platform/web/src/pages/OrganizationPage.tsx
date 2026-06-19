import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Input, Select, Table, Tag, type TableColumn } from '@work/ui';
import type { DepartmentDto, EmployeeDto, UpdateDepartmentInput } from '@work/platform-contract';
import { getPlatformCurrentUser, getPlatformRolesApi } from '../runtime';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; departments: DepartmentDto[]; employees: EmployeeDto[] }
  | { kind: 'error'; message: string };

type DepartmentForm = {
  id?: string;
  code: string;
  name: string;
  parentId: string;
  managerUserId: string;
  sortOrder: string;
};

const EMPTY_FORM: DepartmentForm = {
  code: '',
  name: '',
  parentId: '',
  managerUserId: '',
  sortOrder: '100',
};

export default function OrganizationPage() {
  const currentUser = getPlatformCurrentUser();
  const canManage = currentUser.permissions.some((permission) => permission.code === 'platform:org:manage');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [form, setForm] = useState<DepartmentForm>(EMPTY_FORM);
  const [message, setMessage] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const api = getPlatformRolesApi();
      const [departments, employees] = await Promise.all([
        api.listDepartments(),
        api.listEmployees().catch(() => []),
      ]);
      setState({ kind: 'ready', departments, employees });
    } catch (error) {
      setState({ kind: 'error', message: readError(error, '加载组织架构失败') });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo(() => {
    if (state.kind !== 'ready') {
      return [];
    }
    return buildTwoLevelRows(state.departments);
  }, [state]);

  const employeeNameById = useMemo(() => {
    if (state.kind !== 'ready') {
      return new Map<string, string>();
    }
    return new Map(state.employees.map((employee) => [employee.id, employee.name]));
  }, [state]);

  const columns: Array<TableColumn<DepartmentRow>> = [
    {
      key: 'name',
      title: '部门名称',
      render: (row) => (
        <span className={`platform-org__name platform-org__name--depth-${row.depth}`}>
          {row.depth > 0 ? '└ ' : ''}
          {row.name}
        </span>
      ),
    },
    { key: 'code', title: '编码', render: (row) => row.code },
    {
      key: 'manager',
      title: '负责人',
      render: (row) => row.managerUserId ? employeeNameById.get(row.managerUserId) ?? row.managerUserId : '未设置',
    },
    { key: 'sortOrder', title: '排序', render: (row) => row.sortOrder },
    {
      key: 'status',
      title: '状态',
      render: (row) => <Tag color={row.status === 'active' ? 'green' : 'gray'}>{row.status === 'active' ? '启用' : '停用'}</Tag>,
    },
    {
      key: 'actions',
      title: '操作',
      render: (row) =>
        canManage ? (
          <div className="platform-org__actions">
            <Button onClick={() => editDepartment(row)} size="sm">编辑</Button>
            <Button onClick={() => void deleteDepartment(row)} size="sm" variant="danger">删除</Button>
          </div>
        ) : (
          <span>只读</span>
        ),
    },
  ];

  function editDepartment(department: DepartmentDto) {
    setForm({
      id: department.id,
      code: department.code,
      name: department.name,
      parentId: department.parentId ?? '',
      managerUserId: department.managerUserId ?? '',
      sortOrder: String(department.sortOrder),
    });
    setMessage(undefined);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setMessage(undefined);
  }

  async function submitForm() {
    if (!canManage) {
      return;
    }
    if (!form.name.trim()) {
      setMessage('请填写部门名称。');
      return;
    }
    if (!form.id && !form.code.trim()) {
      setMessage('请填写部门编码。');
      return;
    }
    setSubmitting(true);
    try {
      const sortOrder = Number.parseInt(form.sortOrder, 10);
      const commonInput = {
        name: form.name.trim(),
        parentId: form.parentId || null,
        managerUserId: form.managerUserId || null,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100,
      } satisfies UpdateDepartmentInput;

      if (form.id) {
        await getPlatformRolesApi().updateDepartment(form.id, commonInput);
        setMessage('部门已更新。');
      } else {
        await getPlatformRolesApi().createDepartment({
          code: form.code.trim(),
          name: commonInput.name,
          parentId: form.parentId || undefined,
          managerUserId: form.managerUserId || undefined,
          sortOrder: commonInput.sortOrder,
        });
        setMessage('部门已创建。');
      }
      resetForm();
      await reload();
    } catch (error) {
      setMessage(readError(error, '保存部门失败'));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteDepartment(department: DepartmentDto) {
    if (!window.confirm(`确认删除部门“${department.name}”？`)) {
      return;
    }
    try {
      await getPlatformRolesApi().deleteDepartment(department.id);
      setMessage('部门已删除。');
      await reload();
    } catch (error) {
      setMessage(readError(error, '删除部门失败'));
    }
  }

  return (
    <section className="platform-org">
      <header className="platform-org__header">
        <div>
          <p className="platform-org__eyebrow">组织管理</p>
          <h2>组织架构</h2>
          <p>维护企业部门树、负责人和排序。本期展示顶层与直接子部门。</p>
        </div>
        <Button disabled={state.kind === 'loading'} onClick={() => void reload()}>刷新</Button>
      </header>

      {message ? <p className="platform-org__message">{message}</p> : null}
      {state.kind === 'loading' ? <p>加载中…</p> : null}
      {state.kind === 'error' ? <p className="platform-org__error">{state.message}</p> : null}

      {state.kind === 'ready' ? (
        <div className="platform-org__grid">
          <section className="platform-org__panel">
            <Table
              columns={columns}
              rows={rows}
              empty={<EmptyState title="暂无部门" description="创建部门后将在此展示组织架构。" />}
            />
          </section>

          <section className="platform-org__panel platform-org__editor">
            <h3>{form.id ? '编辑部门' : '新建部门'}</h3>
            {canManage ? (
              <>
                <Input
                  disabled={Boolean(form.id)}
                  label="部门编码"
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                  placeholder="如 RD"
                  value={form.code}
                />
                <Input
                  label="部门名称"
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="请输入部门名称"
                  value={form.name}
                />
                <Select
                  label="上级部门"
                  onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))}
                  value={form.parentId}
                >
                  <option value="">顶层部门</option>
                  {state.departments
                    .filter((department) => department.parentId === undefined && department.id !== form.id)
                    .map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                </Select>
                <Select
                  label="负责人"
                  onChange={(event) => setForm((current) => ({ ...current, managerUserId: event.target.value }))}
                  value={form.managerUserId}
                >
                  <option value="">未设置</option>
                  {state.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </Select>
                <Input
                  label="排序"
                  min={0}
                  onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
                  type="number"
                  value={form.sortOrder}
                />
                <div className="platform-org__form-actions">
                  <Button disabled={submitting} onClick={() => void submitForm()} variant="primary">
                    {submitting ? '保存中…' : '保存部门'}
                  </Button>
                  <Button onClick={resetForm}>清空</Button>
                </div>
              </>
            ) : (
              <EmptyState title="只读模式" description="当前账号没有 platform:org:manage，不能修改组织架构。" />
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

type DepartmentRow = DepartmentDto & { depth: 0 | 1 };

function buildTwoLevelRows(departments: DepartmentDto[]): DepartmentRow[] {
  const sorted = [...departments].sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code));
  const childrenByParent = new Map<string, DepartmentDto[]>();
  for (const department of sorted) {
    if (department.parentId) {
      childrenByParent.set(department.parentId, [...(childrenByParent.get(department.parentId) ?? []), department]);
    }
  }

  return sorted
    .filter((department) => !department.parentId)
    .flatMap((department) => [
      { ...department, depth: 0 as const },
      ...(childrenByParent.get(department.id) ?? []).map((child) => ({ ...child, depth: 1 as const })),
    ]);
}

function readError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
