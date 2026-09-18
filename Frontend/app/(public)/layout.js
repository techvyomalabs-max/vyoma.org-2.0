import { ModalProvider } from '@/components/layout/ModalProvider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { GlobalModals } from '@/components/layout/GlobalModals';

export default function PublicLayout({ children }) {
  return (
    <ModalProvider>
      <Header />
      {children}
      <Footer />
      <GlobalModals />
    </ModalProvider>
  );
}
