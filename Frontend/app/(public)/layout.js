import { draftMode } from 'next/headers';
import { ModalProvider } from '@/components/layout/ModalProvider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { GlobalModals } from '@/components/layout/GlobalModals';

export default async function PublicLayout({ children }) {
  const { isEnabled } = await draftMode();

  return (
    <ModalProvider>
      {isEnabled && (
        <div className="flex items-center justify-between gap-2 bg-amber-gold px-4 py-2 font-sans text-sm text-charcoal">
          <span>Previewing unpublished draft content — visitors do not see this.</span>
          <a href="/api/draft-disable?path=/" className="font-semibold underline">
            Exit preview
          </a>
        </div>
      )}
      <Header />
      {children}
      <Footer />
      <GlobalModals />
    </ModalProvider>
  );
}
