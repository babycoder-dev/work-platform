import { useEffect, useState } from 'react';
import { Button, Modal, Textarea } from '@work/ui';
import type { EmployeeDto, StatusLogDto } from '@work/platform-contract';
import { EmployeePicker } from '../components/EmployeePicker';
import { getPlatformRolesApi } from '../runtime';
import '../styles.css';

const MAX_SUBJECTS = 100;
const MAX_CONTENT_LENGTH = 2000;

export function BatchStatusLogModal({
  employees,
  open,
  onClose,
  onCreated,
}: {
  employees: EmployeeDto[];
  open: boolean;
  onClose: () => void;
  onCreated: (created: StatusLogDto[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [message, setMessage] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedIds([]);
      setContent('');
      setMessage(undefined);
      setSubmitting(false);
    }
  }, [open]);

  async function submit() {
    const trimmedContent = content.trim();
    if (selectedIds.length === 0) {
      setMessage('请至少选择 1 名员工');
      return;
    }
    if (!trimmedContent) {
      setMessage('请输入近况内容');
      return;
    }
    if (selectedIds.length > MAX_SUBJECTS) {
      setMessage(`最多选择 ${MAX_SUBJECTS} 人`);
      return;
    }
    if (trimmedContent.length > MAX_CONTENT_LENGTH) {
      setMessage(`近况内容不能超过 ${MAX_CONTENT_LENGTH} 字`);
      return;
    }

    setSubmitting(true);
    setMessage(undefined);
    try {
      const created = await getPlatformRolesApi().createStatusLogs({
        subjectEmployeeIds: selectedIds,
        content: trimmedContent,
      });
      onCreated(created);
    } catch (error) {
      setMessage(readError(error, '记录近况失败'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      description="选择可见范围内的员工，批量追加同一条纯文本近况。"
      footer={(
        <>
          <Button disabled={submitting} onClick={onClose}>
            取消
          </Button>
          <Button disabled={submitting} onClick={() => void submit()} variant="primary">
            {submitting ? '记录中…' : '记录近况'}
          </Button>
        </>
      )}
      onClose={onClose}
      open={open}
      title="批量记录近况"
    >
      <div className="batch-status-log">
        <EmployeePicker
          employees={employees}
          maxSelected={MAX_SUBJECTS}
          onChange={setSelectedIds}
          value={selectedIds}
        />
        <Textarea
          label="近况内容"
          maxLength={MAX_CONTENT_LENGTH}
          onChange={(event) => setContent(event.target.value)}
          placeholder="输入要记录的近况内容…"
          rows={5}
          value={content}
        />
        <p className="batch-status-log__counter">{content.length} / {MAX_CONTENT_LENGTH}</p>
        {message ? <p className="platform-employees__message platform-employees__message--error">{message}</p> : null}
      </div>
    </Modal>
  );
}

function readError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
