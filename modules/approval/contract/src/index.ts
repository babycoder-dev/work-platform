export const approvalPermissions = {
  instanceCreate: 'approval:instance:create',
  taskApprove: 'approval:task:approve',
} as const;

export const approvalEvents = {
  instanceCompleted: 'approval.instance.completed',
} as const;
