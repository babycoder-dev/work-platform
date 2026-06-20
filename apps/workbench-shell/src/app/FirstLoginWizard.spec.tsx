import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EmployeeDto, PasswordPolicyDto } from '@work/platform-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstLoginWizard } from './FirstLoginWizard';
import type { PlatformApiClient } from '../platform/platform-api';

const passwordPolicy: PasswordPolicyDto = {
  minLength: 8,
  requireNumber: true,
  requireUppercase: false,
  requireSpecialChar: false,
  maxFailedAttempts: 5,
  lockDurationMinutes: 15,
};

const myProfile: EmployeeDto = {
  id: 'user-001',
  enterpriseId: 'ent-default',
  employeeNo: 'E001',
  account: 'zhangsan',
  name: '张三',
  title: '运营专员',
  mobile: '13900000000',
  email: 'zhangsan@example.com',
  status: 'active',
  roleIds: ['role-001'],
  mustChangePassword: false,
};

describe('FirstLoginWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the forced password step with exact design-system copy', async () => {
    renderWizard();

    expect(await screen.findByText('首次登录设置')).toBeInTheDocument();
    expect(screen.getByText('第 1/2 步 · 设置新密码')).toBeInTheDocument();
    expect(screen.getByText('为保障账号安全，请先设置新密码并完善本人档案。')).toBeInTheDocument();
    expect(screen.getByLabelText('原密码')).toBeInTheDocument();
    expect(screen.getByLabelText('新密码')).toBeInTheDocument();
    expect(screen.getByLabelText('确认新密码')).toBeInTheDocument();
    expect(screen.getByText('密码至少 8 位，需含数字。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一步：完善个人信息' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退出登录' })).toBeInTheDocument();
  });

  it('cannot be closed by Escape or scrim click', async () => {
    renderWizard();
    await screen.findByText('首次登录设置');

    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('首次登录设置')).toBeInTheDocument();

    await userEvent.click(document.querySelector('.work-scrim') as HTMLElement);
    expect(screen.getByText('首次登录设置')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关闭' })).not.toBeInTheDocument();
  });

  it('blocks invalid password changes before calling the API', async () => {
    const api = createApi();
    renderWizard(api);

    await fillPasswordStep({
      oldPassword: 'old-password1',
      newPassword: 'short',
      confirmPassword: 'short',
    });
    await userEvent.click(screen.getByRole('button', { name: '下一步：完善个人信息' }));

    expect(screen.getByText('新密码至少 8 位。')).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('新密码'));
    await userEvent.type(screen.getByLabelText('新密码'), 'password');
    await userEvent.clear(screen.getByLabelText('确认新密码'));
    await userEvent.type(screen.getByLabelText('确认新密码'), 'password');
    await userEvent.click(screen.getByRole('button', { name: '下一步：完善个人信息' }));

    expect(screen.getByText('新密码需包含数字。')).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('新密码'));
    await userEvent.type(screen.getByLabelText('新密码'), 'password1');
    await userEvent.clear(screen.getByLabelText('确认新密码'));
    await userEvent.type(screen.getByLabelText('确认新密码'), 'password2');
    await userEvent.click(screen.getByRole('button', { name: '下一步：完善个人信息' }));

    expect(screen.getByText('两次输入的新密码不一致。')).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('新密码'));
    await userEvent.type(screen.getByLabelText('新密码'), 'old-password1');
    await userEvent.clear(screen.getByLabelText('确认新密码'));
    await userEvent.type(screen.getByLabelText('确认新密码'), 'old-password1');
    await userEvent.click(screen.getByRole('button', { name: '下一步：完善个人信息' }));

    expect(screen.getByText('新密码不能与原密码相同。')).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
  }, 15000);

  it('shows backend password errors and stays on the password step', async () => {
    const api = createApi({
      changePassword: vi.fn().mockRejectedValue(new Error('原密码错误')),
    });
    renderWizard(api);

    await submitValidPasswordStep();

    expect(await screen.findByText('原密码错误')).toBeInTheDocument();
    expect(screen.getByText('第 1/2 步 · 设置新密码')).toBeInTheDocument();
    expect(api.getMyProfile).not.toHaveBeenCalled();
  });

  it('moves to profile completion after password change and submits the narrow tri-state profile body', async () => {
    const api = createApi();
    const onCompleted = vi.fn();
    renderWizard(api, { onCompleted });

    await submitValidPasswordStep();

    expect(await screen.findByText('第 2/2 步 · 完善个人信息')).toBeInTheDocument();
    expect(api.getMyProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('姓名')).toHaveValue('张三');
    expect(screen.getByLabelText('手机')).toHaveValue('13900000000');
    expect(screen.getByLabelText('邮箱')).toHaveValue('zhangsan@example.com');
    expect(screen.getByLabelText('职务')).toHaveValue('运营专员');

    await userEvent.clear(screen.getByLabelText('职务'));
    await userEvent.clear(screen.getByLabelText('邮箱'));
    await userEvent.clear(screen.getByLabelText('手机'));
    await userEvent.type(screen.getByLabelText('手机'), '13800000000');
    await userEvent.click(screen.getByRole('button', { name: '完成并进入工作台' }));

    await waitFor(() => expect(api.updateMyProfile).toHaveBeenCalled());
    expect(api.updateMyProfile).toHaveBeenCalledWith({
      name: '张三',
      mobile: '13800000000',
      email: null,
      title: null,
    });
    expect(api.updateMyProfile.mock.calls[0][0]).not.toHaveProperty('departmentId');
    expect(api.updateMyProfile.mock.calls[0][0]).not.toHaveProperty('status');
    expect(api.updateMyProfile.mock.calls[0][0]).not.toHaveProperty('roleIds');
    expect(onCompleted).toHaveBeenCalledTimes(1);
  }, 15000);

  it('requires name and mobile and validates email before profile submission', async () => {
    const api = createApi();
    renderWizard(api);

    await submitValidPasswordStep();
    await screen.findByText('第 2/2 步 · 完善个人信息');

    await userEvent.clear(screen.getByLabelText('姓名'));
    await userEvent.click(screen.getByRole('button', { name: '完成并进入工作台' }));
    expect(screen.getByText('姓名不能为空。')).toBeInTheDocument();
    expect(api.updateMyProfile).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('姓名'), '张三');
    await userEvent.clear(screen.getByLabelText('手机'));
    await userEvent.click(screen.getByRole('button', { name: '完成并进入工作台' }));
    expect(screen.getByText('手机不能为空。')).toBeInTheDocument();
    expect(api.updateMyProfile).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('手机'), '13800000000');
    await userEvent.clear(screen.getByLabelText('邮箱'));
    await userEvent.type(screen.getByLabelText('邮箱'), 'not-email');
    await userEvent.click(screen.getByRole('button', { name: '完成并进入工作台' }));
    expect(screen.getByText('请输入有效的邮箱地址。')).toBeInTheDocument();
    expect(api.updateMyProfile).not.toHaveBeenCalled();
  }, 15000);

  it('shows profile preload failure and retries', async () => {
    const api = createApi({
      getMyProfile: vi
        .fn()
        .mockRejectedValueOnce(new Error('档案加载失败'))
        .mockResolvedValueOnce(myProfile),
    });
    renderWizard(api);

    await submitValidPasswordStep();

    expect(await screen.findByText('档案加载失败')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重新加载档案' }));

    expect(await screen.findByLabelText('姓名')).toHaveValue('张三');
    expect(api.getMyProfile).toHaveBeenCalledTimes(2);
  });

  it('lets the user escape by logging out', async () => {
    const onLogout = vi.fn();
    renderWizard(createApi(), { onLogout });

    await userEvent.click(await screen.findByRole('button', { name: '退出登录' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

function renderWizard(
  api = createApi(),
  handlers: { onCompleted?: () => void; onLogout?: () => void } = {},
) {
  return render(
    <FirstLoginWizard
      api={api}
      onCompleted={handlers.onCompleted ?? vi.fn()}
      onLogout={handlers.onLogout ?? vi.fn()}
    />,
  );
}

function createApi(overrides: Partial<WizardApiMock> = {}) {
  return {
    changePassword: vi.fn().mockResolvedValue(undefined),
    getPasswordPolicy: vi.fn().mockResolvedValue(passwordPolicy),
    getMyProfile: vi.fn().mockResolvedValue(myProfile),
    updateMyProfile: vi.fn().mockResolvedValue(myProfile),
    ...overrides,
  } as WizardApiMock;
}

type WizardApiMock = Pick<
  PlatformApiClient,
  'changePassword' | 'getPasswordPolicy' | 'getMyProfile' | 'updateMyProfile'
> & {
  changePassword: ReturnType<typeof vi.fn>;
  getPasswordPolicy: ReturnType<typeof vi.fn>;
  getMyProfile: ReturnType<typeof vi.fn>;
  updateMyProfile: ReturnType<typeof vi.fn>;
};

async function fillPasswordStep({
  oldPassword,
  newPassword,
  confirmPassword,
}: {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  await userEvent.clear(await screen.findByLabelText('原密码'));
  await userEvent.type(screen.getByLabelText('原密码'), oldPassword);
  await userEvent.clear(screen.getByLabelText('新密码'));
  await userEvent.type(screen.getByLabelText('新密码'), newPassword);
  await userEvent.clear(screen.getByLabelText('确认新密码'));
  await userEvent.type(screen.getByLabelText('确认新密码'), confirmPassword);
}

async function submitValidPasswordStep() {
  await fillPasswordStep({
    oldPassword: 'old-password1',
    newPassword: 'new-password1',
    confirmPassword: 'new-password1',
  });
  await userEvent.click(screen.getByRole('button', { name: '下一步：完善个人信息' }));
}
