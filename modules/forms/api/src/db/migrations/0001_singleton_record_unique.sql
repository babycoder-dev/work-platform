CREATE UNIQUE INDEX IF NOT EXISTS form_records_profile_employee_singleton_unique
  ON forms.form_records (enterprise_id, slot_key, subject_type, subject_id)
  WHERE slot_key = 'profile.employee';
