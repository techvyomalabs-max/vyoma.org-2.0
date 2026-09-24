import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';

// Enables Next.js Draft Mode so a public page can render draftData instead
// of the published data — this is what "Preview draft" links to (see
// components/admin/cms/SectionEditorHeader.jsx). Not wired to any real page
// yet in this phase; Phase B mints the actual secret-bearing links
// server-side once there's a page to preview, so the secret itself never
// reaches the browser bundle.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const path = searchParams.get('path') || '/';

  if (!secret || secret !== process.env.DRAFT_MODE_SECRET) {
    return new Response('Invalid or missing token.', { status: 401 });
  }
  if (!path.startsWith('/')) {
    return new Response('path must be a site-relative path.', { status: 400 });
  }

  (await draftMode()).enable();
  redirect(path);
}
