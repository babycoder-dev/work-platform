import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@work/errors';
import type { EmployeeDto, StatusLogDto } from '@work/platform-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPlatformRuntimeForTest, setPlatformRuntime } from '../runtime';
import { EmployeeProfileDrawer } from './EmployeeProfileDrawer';

describe('EmployeeProfileDrawer', () => {
  const get = vi.fn();
  const put = vi.fn();

  beforeEach(() => {
    get.mockReset();
    put.mockReset();
    setRuntime([
      'platform:employee:view',
      'presence:board:view',
      'forms:record:view',
      'forms:record:submit',
      'forms:profile-definition:view',
    ]);
  });

  afterEach(() => {
    __resetPlatformRuntimeForTest();
    vi.restoreAllMocks();
  });

  it('aggregates fixed fields, presence, custom fields, and status timeline in one drawer', async () => {
    mockDrawerData();

    renderDrawer();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('张伟 · 成员详情')).toBeInTheDocument();
    expect(screen.getByText('张伟')).toBeInTheDocument();
    expect(screen.getByText('工程师 · 研发部')).toBeInTheDocument();
    expect(screen.getByText('账号信息')).toBeInTheDocument();
    expect(screen.getByText('组织与角色')).toBeInTheDocument();
    expect(screen.getByText('联系方式')).toBeInTheDocument();
    expect(screen.getByText('在位状态')).toBeInTheDocument();
    expect(screen.getByText('自定义字段')).toBeInTheDocument();
    expect(screen.getByText('近况脉络')).toBeInTheDocument();
    expect(screen.getByText('000001')).toBeInTheDocument();
    expect(screen.getByText('zhangwei')).toBeInTheDocument();
    expect(screen.getByText('系统管理员')).toBeInTheDocument();
    expect(await screen.findByText('在岗')).toBeInTheDocument();
    expect(screen.getByText('研发部 · 张伟')).toBeInTheDocument();
    expect(await screen.findByText('花名')).toBeInTheDocument();
    expect(screen.getByText('阿伟')).toBeInTheDocument();
    expect(await screen.findByText('完成客户回访')).toBeInTheDocument();
  });

  it('degrades presence and custom sections without calling missing-permission endpoints', async () => {
    setRuntime(['platform:employee:view']);
    mockDrawerData();

    renderDrawer();

    expect(await screen.findByText('当前无在位记录')).toBeInTheDocument();
    expect(screen.getByText('暂无自定义字段记录')).toBeInTheDocument();
    await waitFor(() =>
      expect(get).not.toHaveBeenCalledWith(expect.stringContaining('status-records/by-employee')),
    );
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining('records/profile.employee'));
  });

  it('does not show custom-field editing without record view permission', async () => {
    setRuntime(['platform:employee:view', 'forms:record:submit', 'forms:profile-definition:view']);
    mockDrawerData();

    renderDrawer();

    expect(await screen.findByText('暂无自定义字段记录')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑自定义字段' })).not.toBeInTheDocument();
  });

  it('shows a record loading error instead of an empty custom-field state', async () => {
    let recordRequestCount = 0;
    get.mockImplementation((url: string) => {
      if (url === 'records/profile.employee/subjects/employee-001') {
        recordRequestCount += 1;
        return recordRequestCount === 1
          ? Promise.reject(
              new ApiError('FORMS_LOAD_FAILED', '自定义字段服务不可用', { status: 500 }),
            )
          : Promise.resolve(profileRecord());
      }
      return drawerGet(url);
    });

    renderDrawer();

    expect(await screen.findByText('自定义字段服务不可用')).toBeInTheDocument();
    expect(screen.queryByText('该员工还没有自定义字段记录。')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('阿伟')).toBeInTheDocument();
  });

  it('does not enter editing when loading the existing record fails', async () => {
    let recordRequestCount = 0;
    get.mockImplementation((url: string) => {
      if (url === 'records/profile.employee/subjects/employee-001') {
        recordRequestCount += 1;
        if (recordRequestCount === 1) {
          return Promise.resolve(profileRecord());
        }
        return Promise.reject(
          new ApiError('FORMS_LOAD_FAILED', '读取现有档案失败', { status: 500 }),
        );
      }
      return drawerGet(url);
    });

    renderDrawer();
    await userEvent.click(await screen.findByRole('button', { name: '编辑自定义字段' }));

    expect(await screen.findByText('读取现有档案失败')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存自定义字段' })).not.toBeInTheDocument();
  });

  it('allows first-time custom-field creation only when record loading returns 404', async () => {
    get.mockImplementation((url: string) => {
      if (url === 'records/profile.employee/subjects/employee-001') {
        return Promise.reject(
          new ApiError('FORMS_RECORD_NOT_FOUND', '表单记录不存在', { status: 404 }),
        );
      }
      return drawerGet(url);
    });

    renderDrawer();
    await userEvent.click(await screen.findByRole('button', { name: '编辑自定义字段' }));

    expect(await screen.findByRole('button', { name: '保存自定义字段' })).toBeInTheDocument();
    expect(screen.getByLabelText('花名')).toHaveValue('');
  });

  it('shows a presence loading error instead of claiming there is no record', async () => {
    mockDrawerData();
    get.mockImplementation((url: string) => {
      if (url === 'status-records/by-employee/employee-001') {
        return Promise.reject(
          new ApiError('PRESENCE_UNAVAILABLE', '在位服务暂不可用', { status: 500 }),
        );
      }
      return drawerGet(url);
    });

    renderDrawer();

    expect(await screen.findByText('在位服务暂不可用')).toBeInTheDocument();
    expect(screen.queryByText('该员工当前没有在位记录。')).not.toBeInTheDocument();
  });

  it('submits all profile fields, including read-only original values, when HR edits custom fields', async () => {
    mockDrawerData();
    put.mockResolvedValueOnce({
      definitionRevision: 5,
      values: [recordValue({ fieldKey: 'nickname', value: '张同学', displaySnapshot: '张同学' })],
    });
    renderDrawer();

    await userEvent.click(await screen.findByRole('button', { name: '编辑自定义字段' }));
    await userEvent.clear(await screen.findByLabelText('花名'));
    await userEvent.type(screen.getByLabelText('花名'), '张同学');
    await userEvent.click(screen.getByRole('button', { name: '保存自定义字段' }));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith(
      'records/profile.employee/subjects/employee-001',
      expect.objectContaining({
        definitionRevision: 5,
        values: expect.arrayContaining([
          { fieldKey: 'nickname', value: '张同学' },
          { fieldKey: 'level', value: 3 },
          { fieldKey: 'joinDate', value: '2026-06-01' },
          { fieldKey: 'skill', value: 'frontend' },
          { fieldKey: 'tags', value: ['mentor'] },
          { fieldKey: 'portrait', value: ['file-001'] },
        ]),
      }),
    );
    expect(put.mock.calls[0]?.[1].values).toHaveLength(6);
    expect(await screen.findByText('已保存自定义字段')).toBeInTheDocument();
  });

  it('blocks required custom fields before calling the upsert API', async () => {
    mockDrawerData();
    renderDrawer();

    await userEvent.click(await screen.findByRole('button', { name: '编辑自定义字段' }));
    await userEvent.clear(await screen.findByLabelText('花名'));
    await userEvent.click(screen.getByRole('button', { name: '保存自定义字段' }));

    expect(screen.getByText('请填写花名')).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  it('reloads the form with new values when the custom field upsert returns 409', async () => {
    let definitionRequestCount = 0;
    let recordRequestCount = 0;
    get.mockImplementation((url: string) => {
      if (url === 'definitions/profile.employee') {
        definitionRequestCount += 1;
        return Promise.resolve(profileDefinition(definitionRequestCount === 1 ? 5 : 6));
      }
      if (url === 'records/profile.employee/subjects/employee-001') {
        recordRequestCount += 1;
        return Promise.resolve(
          profileRecord(
            recordRequestCount < 3 ? '阿伟' : '服务端新值',
            recordRequestCount < 3 ? 5 : 6,
          ),
        );
      }
      return drawerGet(url);
    });
    put.mockRejectedValueOnce(
      new ApiError('FORMS_DEFINITION_CONFLICT', '表单定义已变化，请重新加载', { status: 409 }),
    );
    renderDrawer();

    await userEvent.click(await screen.findByRole('button', { name: '编辑自定义字段' }));
    await userEvent.clear(await screen.findByLabelText('花名'));
    await userEvent.type(screen.getByLabelText('花名'), '张同学');
    await userEvent.click(screen.getByRole('button', { name: '保存自定义字段' }));

    expect(await screen.findByText('表单定义已变化，请重新加载')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存自定义字段' })).toBeInTheDocument();
    expect(await screen.findByLabelText('花名')).toHaveValue('服务端新值');
    expect(screen.queryByDisplayValue('张同学')).not.toBeInTheDocument();
  });

  it('does not reload a conflict when a non-409 error mentions the definition', async () => {
    mockDrawerData();
    put.mockRejectedValueOnce(
      new ApiError('FORMS_SAVE_FAILED', '定义服务暂不可用', { status: 500 }),
    );
    renderDrawer();

    await userEvent.click(await screen.findByRole('button', { name: '编辑自定义字段' }));
    const definitionCallsBeforeSave = get.mock.calls.filter(
      ([url]) => url === 'definitions/profile.employee',
    ).length;
    await userEvent.click(screen.getByRole('button', { name: '保存自定义字段' }));

    expect(await screen.findByText('定义服务暂不可用')).toBeInTheDocument();
    expect(get.mock.calls.filter(([url]) => url === 'definitions/profile.employee')).toHaveLength(
      definitionCallsBeforeSave,
    );
  });

  it('blocks invalid number values instead of serializing NaN', async () => {
    get.mockImplementation((url: string) => {
      if (url === 'records/profile.employee/subjects/employee-001') {
        return Promise.resolve(profileRecord('阿伟', 5, Number.NaN));
      }
      return drawerGet(url);
    });
    renderDrawer();

    await userEvent.click(await screen.findByRole('button', { name: '编辑自定义字段' }));
    fireEvent.change(await screen.findByLabelText('职级'), { target: { value: 'not-a-number' } });
    await userEvent.click(screen.getByRole('button', { name: '保存自定义字段' }));

    expect(screen.getByText('请输入有效数字：职级')).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  function setRuntime(permissionCodes: string[]) {
    __resetPlatformRuntimeForTest();
    setPlatformRuntime({
      currentUser: {
        id: 'user-admin',
        enterpriseId: 'ent-default',
        permissions: permissionCodes.map((code) => ({ code })),
      } as never,
      createHttpClient: () =>
        ({ get, post: vi.fn(), put, patch: vi.fn(), delete: vi.fn() }) as never,
    });
  }

  function renderDrawer() {
    return render(
      <EmployeeProfileDrawer
        departmentName="研发部"
        employee={employee()}
        employeeNameById={new Map([['employee-001', '张伟']])}
        onClose={vi.fn()}
        open
        refreshKey={0}
        roleNames={['系统管理员']}
      />,
    );
  }

  function mockDrawerData() {
    get.mockImplementation(drawerGet);
  }

  function drawerGet(url: string) {
    if (url === 'status-records/by-employee/employee-001') {
      return Promise.resolve({
        record: {
          id: 'presence-001',
          enterpriseId: 'ent-default',
          userId: 'employee-001',
          employeeNo: '000001',
          userName: '张伟',
          departmentId: 'dept-rd',
          departmentName: '研发部',
          status: 'working',
          startAt: '2026-06-24T08:00:00.000Z',
          remark: '正常在岗',
          createdBy: 'employee-001',
          createdAt: '2026-06-24T08:00:00.000Z',
        },
      });
    }
    if (url === 'records/profile.employee/subjects/employee-001') {
      return Promise.resolve(profileRecord());
    }
    if (url === 'definitions/profile.employee') {
      return Promise.resolve(profileDefinition());
    }
    if (url === 'employees/employee-001/status-logs?limit=20&offset=0') {
      return Promise.resolve({
        items: [statusLog({ content: '完成客户回访' })],
        total: 1,
      });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  }

  function profileDefinition(revision = 5) {
    return {
      revision,
      status: 'active',
      fields: [
        field({ fieldKey: 'nickname', label: '花名', fieldType: 'text', required: true }),
        field({ fieldKey: 'level', label: '职级', fieldType: 'number' }),
        field({ fieldKey: 'joinDate', label: '入职日期', fieldType: 'date' }),
        field({
          fieldKey: 'skill',
          label: '技能方向',
          fieldType: 'single_select',
          options: [{ key: 'frontend', label: '前端' }],
        }),
        field({
          fieldKey: 'tags',
          label: '标签',
          fieldType: 'multi_select',
          options: [{ key: 'mentor', label: '导师' }],
        }),
        field({ fieldKey: 'portrait', label: '照片', fieldType: 'image' }),
      ],
    };
  }

  function profileRecord(nickname = '阿伟', revision = 5, level: unknown = 3) {
    return {
      definitionRevision: revision,
      id: 'record-001',
      values: [
        recordValue({
          fieldKey: 'nickname',
          fieldLabelSnapshot: '花名',
          value: nickname,
          displaySnapshot: nickname,
          sortOrderSnapshot: 1,
        }),
        recordValue({
          fieldKey: 'level',
          fieldLabelSnapshot: '职级',
          fieldTypeSnapshot: 'number',
          value: level,
          displaySnapshot: 'P3',
          sortOrderSnapshot: 2,
        }),
        recordValue({
          fieldKey: 'joinDate',
          fieldLabelSnapshot: '入职日期',
          fieldTypeSnapshot: 'date',
          value: '2026-06-01',
          displaySnapshot: '2026-06-01',
          sortOrderSnapshot: 3,
        }),
        recordValue({
          fieldKey: 'skill',
          fieldLabelSnapshot: '技能方向',
          fieldTypeSnapshot: 'single_select',
          value: 'frontend',
          displaySnapshot: '前端',
          sortOrderSnapshot: 4,
        }),
        recordValue({
          fieldKey: 'tags',
          fieldLabelSnapshot: '标签',
          fieldTypeSnapshot: 'multi_select',
          value: ['mentor'],
          displaySnapshot: ['导师'],
          sortOrderSnapshot: 5,
        }),
        recordValue({
          fieldKey: 'portrait',
          fieldLabelSnapshot: '照片',
          fieldTypeSnapshot: 'image',
          value: ['file-001'],
          displaySnapshot: '照片 file-001',
          sortOrderSnapshot: 6,
        }),
      ],
    };
  }
});

function employee(overrides: Partial<EmployeeDto> = {}): EmployeeDto {
  return {
    id: 'employee-001',
    enterpriseId: 'ent-default',
    employeeNo: '000001',
    account: 'zhangwei',
    name: '张伟',
    departmentId: 'dept-rd',
    title: '工程师',
    mobile: '13800000000',
    email: 'zhangwei@example.com',
    status: 'active',
    roleIds: ['role-admin'],
    mustChangePassword: false,
    ...overrides,
  };
}

function recordValue(overrides: Record<string, unknown> = {}) {
  return {
    fieldKey: 'nickname',
    fieldLabelSnapshot: '花名',
    fieldTypeSnapshot: 'text',
    value: '阿伟',
    displaySnapshot: '阿伟',
    sortOrderSnapshot: 1,
    ...overrides,
  };
}

function field(overrides: Record<string, unknown>) {
  return {
    fieldKey: 'field',
    label: '字段',
    fieldType: 'text',
    required: false,
    sortOrder: 1,
    status: 'active',
    ...overrides,
  };
}

function statusLog(overrides: Partial<StatusLogDto> = {}): StatusLogDto {
  return {
    id: 'log-001',
    enterpriseId: 'ent-default',
    subjectEmployeeId: 'employee-001',
    authorEmployeeId: 'employee-001',
    content: '近况内容',
    createdAt: '2026-06-24T08:00:00.000Z',
    ...overrides,
  };
}
