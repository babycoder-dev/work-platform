export function Badge({ count, label }: { count?: number | string; label?: string }) {
  return <span className="work-badge">{label ?? count}</span>;
}
