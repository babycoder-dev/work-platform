export interface StatusLogDto {
  id: string;
  enterpriseId: string;
  subjectEmployeeId: string;
  authorEmployeeId: string;
  content: string;
  createdAt: string;
}

export interface CreateStatusLogsInput {
  subjectEmployeeIds: string[];
  content: string;
}

export interface ListStatusLogsQuery {
  limit?: number;
  offset?: number;
}

export interface ListStatusLogsResult {
  items: StatusLogDto[];
  total: number;
}
