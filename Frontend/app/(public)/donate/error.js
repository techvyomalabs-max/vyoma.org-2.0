'use client';

import { useEffect } from 'react';
import { Button } from '@/components/common/Button';

// Next.js App Router convention: catches any error thrown while rendering
// this route segment (including the Donate page's server-side data
// fetches — content/schemes/settings) and shows this instead of the raw
// "Unable to reach the server" exception crashing the whole page. A
// transient backend blip (restart, brief network issue) should degrade to
// this, not take the entire Donate page down with no way to recover
// short of a manual URL reload.
export default function DonateError({ error, reset }) {
  useEffect(() => {
    console.error('[donate] page error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 bg-white px-8 py-20 text-center font-sans">
      <h1 className="font-sans text-h2 font-bold text-vyoma-blue">We couldn&apos;t load the Donate page</h1>
      <p className="max-w-[480px] font-sans text-[15px] text-charcoal">
        This is usually a temporary connection issue. Please try again — if it keeps happening, contact our team and
        we&apos;ll help you complete your donation another way.
      </p>
      <Button variant="solid" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
