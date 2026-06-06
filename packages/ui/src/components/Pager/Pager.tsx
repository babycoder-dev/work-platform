import { Button } from '../Button/Button';

export function Pager({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="work-pager">
      <span>共 {total} 条</span>
      <Button disabled={page <= 1} onClick={() => onChange(page - 1)} size="sm">
        上一页
      </Button>
      <span>
        {page} / {pageCount}
      </span>
      <Button disabled={page >= pageCount} onClick={() => onChange(page + 1)} size="sm">
        下一页
      </Button>
    </div>
  );
}
