import { Injectable } from '@nestjs/common';
import type {
  CreatePresenceStatusRecordInput,
  PresenceBoardQuery,
  PresenceStatusRecordDto,
} from '@work/presence-contract';

@Injectable()
export class PresenceStatusService {
  private readonly records: PresenceStatusRecordDto[] = [];

  getBoard(_query: PresenceBoardQuery) {
    return {
      items: this.records,
    };
  }

  listRecords() {
    return {
      items: this.records,
    };
  }

  createRecord(input: CreatePresenceStatusRecordInput) {
    const record: PresenceStatusRecordDto = {
      id: crypto.randomUUID(),
      userId: 'mock-user-001',
      userName: '示例用户',
      departmentId: 'mock-dept-001',
      departmentName: '示例部门',
      ...input,
    };

    this.records.push(record);

    return record;
  }
}
