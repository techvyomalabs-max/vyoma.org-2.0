import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path') || '/';
  if (!path.startsWith('/')) {
    return new Response('path must be a site-relative path.', { status: 400 });
  }

  (await draftMode()).disable();
  redirect(path);
}
