import { presetPresenceStatusKeys } from '@work/presence-contract';

export function statusTagColor(
  statusKey: string,
): 'green' | 'purple' | 'cyan' | 'orange' | 'blue' {
  if (statusKey === 'working') return 'green';
  if (statusKey === 'business_trip') return 'purple';
  if (statusKey === 'field_research') return 'cyan';
  if ((presetPresenceStatusKeys as readonly string[]).includes(statusKey)) return 'orange';
  return 'blue';
}
