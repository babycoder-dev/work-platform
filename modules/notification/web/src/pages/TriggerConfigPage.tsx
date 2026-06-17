import { useCallback, useEffect, useState } from 'react';
import type { TriggerConfigDto, TriggerRecipient, TriggerRecipientKind } from '@work/notification-contract';
import { notificationPermissions } from '@work/notification-contract';
import { Button, EmptyState, Input, Switch, Tag } from '@work/ui';
import { getNotificationCurrentUser, getNotificationTriggerConfigApi } from '../runtime';

const recipientKindLabels: Record<TriggerRecipientKind, string> = {
  department_manager: '部门负责人',
  role: '指定角色',
  subject: '事件主体',
  self: '本人',
};

const triggerLabels: Record<string, string> = {
  'presence.status.changed': '在位状态变更',
  'profile.updated': '个人档案更新',
};

export default function TriggerConfigPage() {
  const currentUser = getNotificationCurrentUser();
  const canManage = currentUser.permissions.some(
    (permission) => permission.code === notificationPermissions.triggerConfigManage,
  );
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [drafts, setDrafts] = useState<Record<string, TriggerConfigDraft>>({});
  const [message, setMessage] = useState<string>();

  const reload = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const items = await getNotificationTriggerConfigApi().listTriggerConfigs();
      setState({ kind: 'ready', items });
      setDrafts(Object.fromEntries(items.map((item) => [item.triggerKey, toDraft(item)])));
    } catch (error) {
      setState({ kind: 'error', message: readError(error, '加载通知触发点配置失败') });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function updateDraft(triggerKey: string, updater: (draft: TriggerConfigDraft) => TriggerConfigDraft) {
    setDrafts((current) => {
      const draft = current[triggerKey];
      if (!draft) {
        return current;
      }
      return { ...current, [triggerKey]: updater(draft) };
    });
  }

  async function save(triggerKey: string) {
    const draft = drafts[triggerKey];
    if (!draft) {
      return;
    }
    try {
      await getNotificationTriggerConfigApi().updateTriggerConfig(triggerKey, {
        enabled: draft.enabled,
        defaultRecipients: draft.defaultRecipients,
      });
      setMessage('通知触发点配置已保存。');
      await reload();
    } catch (error) {
      setMessage(readError(error, '保存通知触发点配置失败'));
    }
  }

  return (
    <section className="notification-trigger-config">
      <header className="notification-trigger-config__header">
        <div>
          <h2>通知触发点配置</h2>
          <p>管理内置触发点是否启用，以及默认接收人。</p>
        </div>
        <Button disabled={state.kind === 'loading'} onClick={() => void reload()}>
          刷新
        </Button>
      </header>

      {message ? <p className="notification-trigger-config__message">{message}</p> : null}
      {!canManage ? <p className="notification-trigger-config__readonly">当前账号没有写权限，配置以只读方式展示。</p> : null}
      {state.kind === 'loading' ? <p>加载中…</p> : null}
      {state.kind === 'error' ? <p className="notification-trigger-config__error">{state.message}</p> : null}
      {state.kind === 'ready' && state.items.length === 0 ? (
        <EmptyState title="暂无触发点" description="后端尚未 seed 通知触发点配置。" />
      ) : null}
      {state.kind === 'ready'
        ? state.items.map((config) => {
            const draft = drafts[config.triggerKey] ?? toDraft(config);
            return (
              <article className="notification-trigger-config__item" key={config.triggerKey}>
                <div className="notification-trigger-config__main">
                  <div>
                    <h3>{triggerLabels[config.triggerKey] ?? config.triggerKey}</h3>
                    <p>{config.triggerKey}</p>
                  </div>
                  <Switch
                    checked={draft.enabled}
                    disabled={!canManage}
                    label={draft.enabled ? '已启用' : '已停用'}
                    onChange={(event) =>
                      updateDraft(config.triggerKey, (current) => ({
                        ...current,
                        enabled: event.target.checked,
                      }))
                    }
                  />
                </div>

                <div className="notification-trigger-config__recipients">
                  {draft.defaultRecipients.length === 0 ? <span>暂无默认接收人。</span> : null}
                  {draft.defaultRecipients.map((recipient, index) => (
                    <Tag key={`${recipient.kind}-${recipient.roleCode ?? index}`} color="blue">
                      {formatRecipient(recipient)}
                      {canManage && isEditableRecipient(recipient) ? (
                        <button
                          aria-label={`删除接收人 ${formatRecipient(recipient)}`}
                          onClick={() =>
                            updateDraft(config.triggerKey, (current) => ({
                              ...current,
                              defaultRecipients: current.defaultRecipients.filter((_, itemIndex) => itemIndex !== index),
                            }))
                          }
                          type="button"
                        >
                          ×
                        </button>
                      ) : null}
                    </Tag>
                  ))}
                </div>

                {canManage ? (
                  <RecipientEditor
                    onAdd={(recipient) =>
                      updateDraft(config.triggerKey, (current) => ({
                        ...current,
                        defaultRecipients: [...current.defaultRecipients, recipient],
                      }))
                    }
                  />
                ) : null}

                <footer className="notification-trigger-config__footer">
                  <span>更新时间：{new Date(config.updatedAt).toLocaleString('zh-CN')}</span>
                  {canManage ? (
                    <Button onClick={() => void save(config.triggerKey)} variant="primary">
                      保存
                    </Button>
                  ) : null}
                </footer>
              </article>
            );
          })
        : null}
    </section>
  );
}

function RecipientEditor({ onAdd }: { onAdd: (recipient: TriggerRecipient) => void }) {
  const [kind, setKind] = useState<'department_manager' | 'role'>('department_manager');
  const [roleCode, setRoleCode] = useState('');

  function addRecipient() {
    if (kind === 'role') {
      const trimmed = roleCode.trim();
      if (!trimmed) {
        return;
      }
      onAdd({ kind, roleCode: trimmed });
      setRoleCode('');
      return;
    }
    onAdd({ kind });
  }

  return (
    <div className="notification-trigger-config__editor">
      <label>
        接收人类型
        <select onChange={(event) => setKind(event.target.value as 'department_manager' | 'role')} value={kind}>
          <option value="department_manager">部门负责人</option>
          <option value="role">指定角色</option>
        </select>
      </label>
      {kind === 'role' ? (
        <Input
          label="角色 code"
          onChange={(event) => setRoleCode(event.target.value)}
          placeholder="company_head / hr / assistant"
          value={roleCode}
        />
      ) : null}
      <Button onClick={addRecipient}>添加接收人</Button>
    </div>
  );
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; items: TriggerConfigDto[] }
  | { kind: 'error'; message: string };

interface TriggerConfigDraft {
  enabled: boolean;
  defaultRecipients: TriggerRecipient[];
}

function toDraft(config: TriggerConfigDto): TriggerConfigDraft {
  return {
    enabled: config.enabled,
    defaultRecipients: config.defaultRecipients.map((recipient) => ({ ...recipient })),
  };
}

function isEditableRecipient(recipient: TriggerRecipient): boolean {
  return recipient.kind === 'department_manager' || recipient.kind === 'role';
}

function formatRecipient(recipient: TriggerRecipient): string {
  if (recipient.kind === 'role') {
    return `角色：${recipient.roleCode ?? '未指定'}`;
  }
  return recipientKindLabels[recipient.kind];
}

function readError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
