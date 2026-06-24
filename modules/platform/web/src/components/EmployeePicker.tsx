import { useMemo, useState } from 'react';
import { Checkbox, EmptyState, Input, Button } from '@work/ui';
import type { EmployeeDto } from '@work/platform-contract';
import '../styles.css';

const DEFAULT_MAX_SELECTED = 100;

export function EmployeePicker({
  employees,
  value,
  onChange,
  maxSelected = DEFAULT_MAX_SELECTED,
}: {
  employees: EmployeeDto[];
  value: string[];
  onChange: (ids: string[]) => void;
  maxSelected?: number;
}) {
  const [keyword, setKeyword] = useState('');
  const selected = useMemo(() => new Set(value), [value]);
  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredEmployees = useMemo(() => {
    if (!normalizedKeyword) {
      return employees;
    }
    return employees.filter((employee) =>
      [employee.name, employee.employeeNo, employee.account].some((field) =>
        field.toLowerCase().includes(normalizedKeyword),
      ),
    );
  }, [employees, normalizedKeyword]);
  const reachedLimit = value.length >= maxSelected;

  function toggle(employeeId: string) {
    if (selected.has(employeeId)) {
      onChange(value.filter((id) => id !== employeeId));
      return;
    }
    if (reachedLimit) {
      return;
    }
    onChange([...value, employeeId]);
  }

  return (
    <section className="employee-picker">
      <div className="employee-picker__toolbar">
        <Input
          label="搜索姓名 / 工号 / 账号"
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索姓名 / 工号 / 账号"
          value={keyword}
        />
        <div className="employee-picker__summary">
          <span>已选 {value.length} 人</span>
          {value.length > 0 ? (
            <Button onClick={() => onChange([])} size="sm" variant="text">
              清空已选
            </Button>
          ) : null}
        </div>
      </div>

      {reachedLimit ? <p className="employee-picker__hint">最多选择 {maxSelected} 人</p> : null}

      {employees.length === 0 ? (
        <EmptyState title="暂无员工" description="当前可见范围内没有可选择的员工。" />
      ) : filteredEmployees.length === 0 ? (
        <EmptyState title="暂无匹配员工" description="请调整姓名、工号或账号关键词。" />
      ) : (
        <div className="employee-picker__list">
          {filteredEmployees.map((employee) => {
            const checked = selected.has(employee.id);
            return (
              <div className="employee-picker__row" key={employee.id}>
                <Checkbox
                  checked={checked}
                  disabled={!checked && reachedLimit}
                  label={`${employee.name}（${employee.employeeNo}）`}
                  onChange={() => toggle(employee.id)}
                />
                <span className="employee-picker__account">{employee.account}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
