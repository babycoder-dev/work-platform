import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Icon, Input, Modal, Table, Tag, Toast, type TableColumn } from '@work/ui';
import type { PresenceStatusTypeDto } from '@work/presence-contract';
import { statusTagColor } from '../components/statusTagColor';
import { getPresenceApi } from '../runtime';

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; items: PresenceStatusTypeDto[] }
  | { kind: 'error'; message: string };

type EditorState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; type: PresenceStatusTypeDto };

type ConfirmAction =
  | { kind: 'default'; type: PresenceStatusTypeDto }
  | { kind: 'archive'; type: PresenceStatusTypeDto }
  | { kind: 'restore'; type: PresenceStatusTypeDto }
  | undefined;

interface Draft {
  key: string;
  label: string;
  sortOrder: string;
}

const INITIAL_DRAFT: Draft = { key: '', label: '', sortOrder: '0' };

export default function StatusTypesPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [editor, setEditor] = useState<EditorState>({ kind: 'closed' });
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>();
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const items = await getPresenceApi().listAllStatusTypes();
      setState({ kind: 'ready', items });
    } catch (error) {
      setState({ kind: 'error', message: readError(error, '加载状态类型失败') });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const columns = useMemo(
    () => statusTypeColumns(setEditor, setDraft, setConfirmAction),
    [],
  );

  async function saveEditor() {
    const label = draft.label.trim();
    const sortOrder = Number(draft.sortOrder);
    if (!label) {
      setMessage('请填写名称');
      return;
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      setMessage('排序必须是非负整数');
      return;
    }
    if (editor.kind === 'create' && !KEY_PATTERN.test(draft.key)) {
      setMessage('key 仅可使用小写字母、数字和下划线');
      return;
    }

    setSaving(true);
    setMessage(undefined);
    try {
      if (editor.kind === 'create') {
        await getPresenceApi().createStatusType({ key: draft.key, label, sortOrder });
      } else if (editor.kind === 'edit') {
        await getPresenceApi().updateStatusType(editor.type.id, { label, sortOrder });
      }
      setEditor({ kind: 'closed' });
      await reload();
    } catch (error) {
      setMessage(readError(error, '保存状态类型失败'));
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function confirmMutation() {
    if (!confirmAction) return;
    setSaving(true);
    setMessage(undefined);
    try {
      if (confirmAction.kind === 'default') {
        await getPresenceApi().setDefaultStatusType(confirmAction.type.id);
      } else if (confirmAction.kind === 'archive') {
        await getPresenceApi().archiveStatusType(confirmAction.type.id);
      } else {
        await getPresenceApi().restoreStatusType(confirmAction.type.id);
      }
    } catch (error) {
      setMessage(readError(error, '更新状态类型失败'));
    } finally {
      setConfirmAction(undefined);
      setSaving(false);
      await reload();
    }
  }

  const modalOpen = editor.kind !== 'closed';
  const editing = editor.kind === 'edit';

  return (
    <section className="presence-status-types">
      <header className="presence-status-types__header">
        <h2>状态字典</h2>
        <Button
          icon={<Icon name="plus" />}
          onClick={() => {
            setDraft(INITIAL_DRAFT);
            setEditor({ kind: 'create' });
          }}
          variant="primary"
        >
          新建状态
        </Button>
      </header>
      <Card flush>
        {state.kind === 'loading' ? <p className="presence-status-types__message">加载中…</p> : null}
        {state.kind === 'error' ? <p className="presence-status-types__error">{state.message}</p> : null}
        {state.kind === 'ready' ? (
          <Table
            columns={columns}
            empty={<EmptyState description="创建后将在此显示。" title="暂无状态类型" />}
            rows={state.items}
          />
        ) : null}
      </Card>
      {message ? <Toast message={message} onClose={() => setMessage(undefined)} /> : null}

      <Modal
        description="Key 创建后不可修改。"
        footer={
          <>
            <Button disabled={saving} onClick={() => setEditor({ kind: 'closed' })}>取消</Button>
            <Button disabled={saving} onClick={() => void saveEditor()} variant="primary">
              {editing ? '保存' : '创建'}
            </Button>
          </>
        }
        onClose={() => setEditor({ kind: 'closed' })}
        open={modalOpen}
        title={editing ? '编辑状态' : '新建状态'}
      >
        <Input
          disabled={editing}
          label="Key"
          onChange={(event) => setDraft((current) => ({ ...current, key: event.target.value }))}
          value={draft.key}
        />
        <Input
          label="名称"
          onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
          value={draft.label}
        />
        <Input
          label="排序"
          min={0}
          onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))}
          type="number"
          value={draft.sortOrder}
        />
      </Modal>

      <ConfirmDialog
        confirmText={confirmText(confirmAction)}
        danger={confirmAction?.kind === 'archive'}
        description={confirmDescription(confirmAction)}
        onCancel={() => setConfirmAction(undefined)}
        onConfirm={() => void confirmMutation()}
        open={confirmAction !== undefined}
        title={confirmText(confirmAction)}
      />
    </section>
  );
}

function statusTypeColumns(
  setEditor: (editor: EditorState) => void,
  setDraft: (draft: Draft) => void,
  setConfirmAction: (action: ConfirmAction) => void,
): Array<TableColumn<PresenceStatusTypeDto>> {
  return [
    { key: 'label', title: '名称', render: (type) => <Tag color={statusTagColor(type.key)} dot>{type.label}</Tag> },
    { key: 'key', title: 'Key', render: (type) => <code>{type.key}</code> },
    { key: 'preset', title: '预置', render: (type) => type.isPreset ? <Badge label="预置" /> : '—' },
    { key: 'default', title: '缺省', render: (type) => type.isDefault ? <Tag color="green" dot>缺省</Tag> : '—' },
    { key: 'status', title: '状态', render: (type) => <Tag color={type.status === 'active' ? 'green' : 'gray'} dot>{type.status === 'active' ? '已启用' : '已停用'}</Tag> },
    { key: 'sortOrder', title: '排序', render: (type) => type.sortOrder },
    {
      key: 'actions',
      title: '操作',
      render: (type) =>
        type.status === 'archived' ? (
          <Button onClick={() => setConfirmAction({ kind: 'restore', type })} size="sm">恢复</Button>
        ) : (
          <>
            <Button onClick={() => {
              setDraft({ key: type.key, label: type.label, sortOrder: String(type.sortOrder) });
              setEditor({ kind: 'edit', type });
            }} size="sm">编辑</Button>
            <Button disabled={type.isDefault} onClick={() => setConfirmAction({ kind: 'default', type })} size="sm">设为缺省</Button>
            <Button disabled={type.isDefault} onClick={() => setConfirmAction({ kind: 'archive', type })} size="sm" variant="danger">停用</Button>
          </>
        ),
    },
  ];
}

function confirmText(action: ConfirmAction): string {
  if (action?.kind === 'default') return '设为缺省状态';
  if (action?.kind === 'archive') return '停用状态';
  if (action?.kind === 'restore') return '恢复状态';
  return '确认操作';
}

function confirmDescription(action: ConfirmAction): string {
  if (!action) return '';
  if (action.kind === 'default') return `将“${action.type.label}”设为缺省在岗状态。`;
  if (action.kind === 'archive') return `停用“${action.type.label}”后将不能继续登记。`;
  return `恢复“${action.type.label}”以允许继续登记。`;
}

function readError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
