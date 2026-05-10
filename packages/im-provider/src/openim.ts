export interface OpenImConfig {
  apiBaseUrl: string;
  adminUserId: string;
  adminSecret: string;
}

export interface OpenImAdminToken {
  token: string;
  expiresAt?: string;
}
