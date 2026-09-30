'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { LegalPageEditor } from '@/components/admin/cms/legal/LegalPageEditor';

function TermsCmsContent() {
  return <LegalPageEditor pageLabel="Terms & Conditions" type="pages/terms" publicPath="/terms" />;
}

export default function TermsCmsPage() {
  return (
    <RequireAdminAuth>
      <TermsCmsContent />
    </RequireAdminAuth>
  );
}
