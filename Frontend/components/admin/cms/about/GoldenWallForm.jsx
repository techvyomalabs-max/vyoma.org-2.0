'use client';
import { SimpleTextListForm } from '@/components/admin/ui/SimpleTextListForm';

// Kept as plain "Name — Location" strings, matching the current shape
// exactly — no active/visible toggle (see SimpleTextListForm).
export function GoldenWallForm({ value, onChange }) {
  return <SimpleTextListForm value={value} onChange={onChange} placeholder="Name — Location" />;
}
