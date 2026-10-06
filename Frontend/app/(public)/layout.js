import { draftMode } from 'next/headers';
import { ModalProvider } from '@/components/layout/ModalProvider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { GlobalModals } from '@/components/layout/GlobalModals';

export default async function PublicLayout({ children }) {
  const { isEnabled } = await draftMode();

  return (
    <ModalProvider>
      {/* Visually hidden until keyboard-focused; first focusable element on
          every public route, so a keyboard/screen-reader user never has to
          tab through the full header nav just to reach the page content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-vyoma-blue focus:px-4 focus:py-2 focus:font-sans focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>
      {isEnabled && (
        <div className="flex items-center justify-between gap-2 bg-amber-gold px-4 py-2 font-sans text-sm text-charcoal">
          <span>Previewing unpublished draft content — visitors do not see this.</span>
          <a href="/api/draft-disable?path=/" className="font-semibold underline">
            Exit preview
          </a>
        </div>
      )}
      <Header />
      <main id="main-content">{children}</main>
      <Footer />
      <GlobalModals />
    </ModalProvider>
  );
}
