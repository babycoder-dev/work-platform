import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Table, Tag, type TableColumn } from '@work/ui';
import type { DepartmentDto, EmployeeDto, StatusLogDto } from '@work/platform-contract';
import { getPlatformCurrentUser, getPlatformRolesApi } from '../runtime';
import { BatchStatusLogModal } from './BatchStatusLogModal';
import { StatusTimeline } from './StatusTimeline';
import '../styles.css';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; employees: EmployeeDto[]; departments: DepartmentDto[] }
  | { kind: 'error'; message: string };

export default function EmployeesPage() {
  const currentUser = getPlatformCurrentUser();
  const canCreateStatusLog = currentUser.permissions.some(
    (permission) => permission.code === 'platform:status-log:create',
  );
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeDto | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [message, setMessage] = useState<string>();
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);

  const reload = useCallback(async () => {
    setMessage(undefined);
    setState({ kind: 'loading' });
    try {
      const api = getPlatformRolesApi();
      const [employees, departments] = await Promise.all([
        api.listEmployees(),
        api.listDepartments().catch(() => []),
      ]);
      setState({ kind: 'ready', employees, departments });
    } catch (error) {
      setState({ kind: 'error', message: readError(error, '加载员工列表失败') });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const departmentNameById = useMemo(() => {
    if (state.kind !== 'ready') {
      return new Map<string, string>();
    }
    return new Map(state.departments.map((department) => [department.id, department.name]));
  }, [state]);

  const employeeNameById = useMemo(() => {
    if (state.kind !== 'ready') {
      return new Map<string, string>();
    }
    return new Map(state.employees.map((employee) => [employee.id, employee.name]));
  }, [state]);

  const columns: Array<TableColumn<EmployeeDto>> = [
    { key: 'name', title: '姓名', render: (employee) => employee.name },
    { key: 'employeeNo', title: '工号', render: (employee) => employee.employeeNo },
    { key: 'account', title: '账号', render: (employee) => employee.account },
    {
      key: 'department',
      title: '部门',
      render: (employee) =>
        employee.departmentId
          ? (departmentNameById.get(employee.departmentId) ?? employee.departmentId)
          : '—',
    },
    { key: 'title', title: '职务', render: (employee) => employee.title ?? '—' },
    {
      key: 'status',
      title: '状态',
      render: (employee) => (
        <Tag color={statusTagColor(employee.status)}>{statusLabel(employee.status)}</Tag>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      render: (employee) => (
        <Button onClick={() => setSelectedEmployee(employee)} size="sm">
          近况
        </Button>
      ),
    },
  ];

  function handleCreated(created: StatusLogDto[]) {
    setBatchOpen(false);
    setMessage(`已为 ${created.length} 名员工记录近况。`);
    if (
      selectedEmployee &&
      created.some((item) => item.subjectEmployeeId === selectedEmployee.id)
    ) {
      setTimelineRefreshKey((current) => current + 1);
    }
  }

  return (
    <section className="platform-employees">
      <header className="platform-employees__header">
        <div>
          <p className="platform-employees__eyebrow">人员组织</p>
          <h2>员工管理</h2>
          <p>查看员工档案、账号状态与近况记录。</p>
        </div>
        <div className="platform-employees__header-actions">
          <Button disabled={state.kind === 'loading'} onClick={() => void reload()}>
            刷新
          </Button>
          {canCreateStatusLog ? (
            <Button onClick={() => setBatchOpen(true)} variant="primary">
              批量记录近况
            </Button>
          ) : null}
        </div>
      </header>

      {message ? <p className="platform-employees__message">{message}</p> : null}
      {state.kind === 'loading' ? <p>加载中…</p> : null}
      {state.kind === 'error' ? (
        <section className="platform-employees__panel">
          <p className="platform-employees__message platform-employees__message--error">
            {state.message}
          </p>
          <Button onClick={() => void reload()}>刷新重试</Button>
        </section>
      ) : null}

      {state.kind === 'ready' ? (
        <section className="platform-employees__panel">
          <Table
            columns={columns}
            empty={<EmptyState title="暂无员工" description="当前可见范围内没有员工。" />}
            rows={state.employees}
          />
        </section>
      ) : null}

      <StatusTimeline
        employee={selectedEmployee}
        employeeNameById={employeeNameById}
        onClose={() => setSelectedEmployee(null)}
        open={Boolean(selectedEmployee)}
        refreshKey={timelineRefreshKey}
      />

      {state.kind === 'ready' ? (
        <BatchStatusLogModal
          employees={state.employees}
          onClose={() => setBatchOpen(false)}
          onCreated={handleCreated}
          open={batchOpen}
        />
      ) : null}
    </section>
  );
}

function statusLabel(status: EmployeeDto['status']): string {
  if (status === 'active') {
    return '在职';
  }
  if (status === 'disabled') {
    return '停用';
  }
  return '离职';
}

function statusTagColor(status: EmployeeDto['status']): 'green' | 'gray' {
  return status === 'active' ? 'green' : 'gray';
}

function readError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
