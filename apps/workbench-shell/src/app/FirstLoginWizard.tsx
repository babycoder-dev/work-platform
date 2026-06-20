import type {
  EmployeeDto,
  PasswordPolicyDto,
  UpdateMyProfileInput,
} from '@work/platform-contract';
import { Button, Icon, Input, Modal } from '@work/ui';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlatformApiClient } from '../platform/platform-api';

type WizardApi = Pick<
  PlatformApiClient,
  'changePassword' | 'getPasswordPolicy' | 'getMyProfile' | 'updateMyProfile'
>;

type Step = 'password' | 'profile';

interface PasswordForm {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface ProfileForm {
  name: string;
  title: string;
  mobile: string;
  email: string;
}

const emptyPasswordForm: PasswordForm = {
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const emptyProfileForm: ProfileForm = {
  name: '',
  title: '',
  mobile: '',
  email: '',
};

export function FirstLoginWizard({
  api,
  onCompleted,
  onLogout,
}: {
  api: WizardApi;
  onCompleted: () => void | Promise<void>;
  onLogout: () => void;
}) {
  const [step, setStep] = useState<Step>('password');
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicyDto>();
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(emptyPasswordForm);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm);
  const [initialProfile, setInitialProfile] = useState<EmployeeDto>();
  const [passwordError, setPasswordError] = useState<string>();
  const [profileError, setProfileError] = useState<string>();
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  useEffect(() => {
    let disposed = false;
    api
      .getPasswordPolicy()
      .then((policy) => {
        if (!disposed) {
          setPasswordPolicy(policy);
        }
      })
      .catch((error) => {
        if (!disposed) {
          setPasswordError(readErrorMessage(error));
        }
      });
    return () => {
      disposed = true;
    };
  }, [api]);

  const loadMyProfile = useCallback(async () => {
    setIsLoadingProfile(true);
    setProfileError(undefined);
    try {
      const profile = await api.getMyProfile();
      setInitialProfile(profile);
      setProfileForm({
        name: profile.name ?? '',
        title: profile.title ?? '',
        mobile: profile.mobile ?? '',
        email: profile.email ?? '',
      });
    } catch (error) {
      setProfileError(readErrorMessage(error));
    } finally {
      setIsLoadingProfile(false);
    }
  }, [api]);

  const passwordPolicyText = useMemo(() => {
    if (!passwordPolicy) {
      return '正在读取密码规则。';
    }
    const rules = [`密码至少 ${passwordPolicy.minLength} 位`];
    if (passwordPolicy.requireNumber) {
      rules.push('需含数字');
    }
    if (passwordPolicy.requireUppercase) {
      rules.push('需含大写字母');
    }
    if (passwordPolicy.requireSpecialChar) {
      rules.push('需含特殊字符');
    }
    return `${rules.join('，')}。`;
  }, [passwordPolicy]);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validatePassword(passwordForm, passwordPolicy);
    if (validationError) {
      setPasswordError(validationError);
      return;
    }

    setIsSubmittingPassword(true);
    setPasswordError(undefined);
    try {
      await api.changePassword({
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      });
      setStep('profile');
      await loadMyProfile();
    } catch (error) {
      setPasswordError(readErrorMessage(error));
    } finally {
      setIsSubmittingPassword(false);
    }
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateProfile(profileForm);
    if (validationError) {
      setProfileError(validationError);
      return;
    }

    setIsSubmittingProfile(true);
    setProfileError(undefined);
    try {
      await api.updateMyProfile(buildProfileInput(profileForm, initialProfile));
      await onCompleted();
    } catch (error) {
      setProfileError(readErrorMessage(error));
    } finally {
      setIsSubmittingProfile(false);
    }
  }

  return (
    <Modal
      description="为保障账号安全，请先设置新密码并完善本人档案。"
      footer={
        <div className="first-login__footer">
          <Button onClick={onLogout} variant="text">
            退出登录
          </Button>
          {step === 'password' ? (
            <Button
              disabled={isSubmittingPassword || !passwordPolicy}
              form="first-login-password-form"
              size="lg"
              type="submit"
              variant="primary"
            >
              {isSubmittingPassword ? '处理中' : '下一步：完善个人信息'}
            </Button>
          ) : (
            <Button
              disabled={isSubmittingProfile || isLoadingProfile}
              form="first-login-profile-form"
              size="lg"
              type="submit"
              variant="primary"
            >
              {isSubmittingProfile ? '处理中' : '完成并进入工作台'}
            </Button>
          )}
        </div>
      }
      onClose={ignoreModalClose}
      open
      title="首次登录设置"
    >
      <div className="first-login">
        {step === 'password' ? (
          <form
            className="first-login__form"
            id="first-login-password-form"
            noValidate
            onSubmit={submitPassword}
          >
            <StepHeader
              description={passwordPolicyText}
              icon="lock"
              title="第 1/2 步 · 设置新密码"
            />
            <Input
              autoComplete="current-password"
              label="原密码"
              onChange={(event) =>
                setPasswordForm((current) => ({ ...current, oldPassword: event.target.value }))
              }
              prefix={<Icon name="lock" />}
              size="lg"
              type="password"
              value={passwordForm.oldPassword}
            />
            <Input
              autoComplete="new-password"
              label="新密码"
              onChange={(event) =>
                setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
              }
              prefix={<Icon name="lock" />}
              size="lg"
              type="password"
              value={passwordForm.newPassword}
            />
            <Input
              autoComplete="new-password"
              label="确认新密码"
              onChange={(event) =>
                setPasswordForm((current) => ({
                  ...current,
                  confirmPassword: event.target.value,
                }))
              }
              prefix={<Icon name="lock" />}
              size="lg"
              type="password"
              value={passwordForm.confirmPassword}
            />
            {passwordError ? <div className="first-login__error">{passwordError}</div> : null}
          </form>
        ) : (
          <form
            className="first-login__form"
            id="first-login-profile-form"
            noValidate
            onSubmit={submitProfile}
          >
            <StepHeader
              description="请确认你的基础信息，便于同事在平台内识别和联系你。"
              icon="user"
              title="第 2/2 步 · 完善个人信息"
            />
            {isLoadingProfile ? <p className="first-login__hint">正在加载本人档案。</p> : null}
            {profileError && !initialProfile ? (
              <div className="first-login__error first-login__error--stacked">
                <span>{profileError}</span>
                <Button onClick={() => void loadMyProfile()}>重新加载档案</Button>
              </div>
            ) : null}
            {initialProfile ? (
              <>
                <Input
                  label="姓名"
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, name: event.target.value }))
                  }
                  prefix={<Icon name="user" />}
                  size="lg"
                  value={profileForm.name}
                />
                <Input
                  label="手机"
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, mobile: event.target.value }))
                  }
                  prefix={<Icon name="user" />}
                  size="lg"
                  value={profileForm.mobile}
                />
                <Input
                  label="邮箱"
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, email: event.target.value }))
                  }
                  prefix={<Icon name="message" />}
                  size="lg"
                  type="email"
                  value={profileForm.email}
                />
                <Input
                  label="职务"
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, title: event.target.value }))
                  }
                  prefix={<Icon name="settings" />}
                  size="lg"
                  value={profileForm.title}
                />
              </>
            ) : null}
            {profileError && initialProfile ? (
              <div className="first-login__error">{profileError}</div>
            ) : null}
          </form>
        )}
      </div>
    </Modal>
  );
}

function StepHeader({
  description,
  icon,
  title,
}: {
  description: string;
  icon: 'lock' | 'user';
  title: string;
}) {
  return (
    <div className="first-login__step">
      <span className="first-login__step-icon">
        <Icon name={icon} />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

function validatePassword(form: PasswordForm, policy?: PasswordPolicyDto): string | undefined {
  if (!policy) {
    return '密码规则尚未加载。';
  }
  if (form.newPassword.length < policy.minLength) {
    return `新密码至少 ${policy.minLength} 位。`;
  }
  if (policy.requireNumber && !/\d/.test(form.newPassword)) {
    return '新密码需包含数字。';
  }
  if (policy.requireUppercase && !/[A-Z]/.test(form.newPassword)) {
    return '新密码需包含大写字母。';
  }
  if (policy.requireSpecialChar && !/[^\dA-Za-z]/.test(form.newPassword)) {
    return '新密码需包含特殊字符。';
  }
  if (form.newPassword !== form.confirmPassword) {
    return '两次输入的新密码不一致。';
  }
  if (form.newPassword === form.oldPassword) {
    return '新密码不能与原密码相同。';
  }
  return undefined;
}

function validateProfile(form: ProfileForm): string | undefined {
  if (!form.name.trim()) {
    return '姓名不能为空。';
  }
  if (!form.mobile.trim()) {
    return '手机不能为空。';
  }
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return '请输入有效的邮箱地址。';
  }
  return undefined;
}

function buildProfileInput(form: ProfileForm, initial?: EmployeeDto): UpdateMyProfileInput {
  const input: UpdateMyProfileInput = {
    name: form.name.trim(),
    mobile: form.mobile.trim(),
  };
  addNullableOptional(input, 'email', form.email, initial?.email);
  addNullableOptional(input, 'title', form.title, initial?.title);
  return input;
}

function addNullableOptional(
  input: UpdateMyProfileInput,
  key: 'email' | 'title',
  value: string,
  initialValue?: string,
) {
  const normalized = value.trim();
  if (normalized) {
    input[key] = normalized;
    return;
  }
  if (initialValue) {
    input[key] = null;
  }
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return '请求失败';
}

function ignoreModalClose() {
  return undefined;
}
