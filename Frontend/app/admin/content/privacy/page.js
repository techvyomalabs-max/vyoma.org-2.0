'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { LegalPageEditor } from '@/components/admin/cms/legal/LegalPageEditor';

function PrivacyCmsContent() {
  return <LegalPageEditor pageLabel="Privacy Policy" type="pages/privacy" publicPath="/privacy" />;
}

export default function PrivacyCmsPage() {
  return (
    <RequireAdminAuth>
      <PrivacyCmsContent />
    </RequireAdminAuth>
  );
}
