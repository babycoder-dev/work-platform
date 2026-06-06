export function Dot({ label = '未读' }: { label?: string }) {
  return <span aria-label={label} className="work-dot" />;
}
