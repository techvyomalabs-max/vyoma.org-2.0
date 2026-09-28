'use client';

import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);
let nextId = 1;

// Global success/error feedback for admin actions (save/publish/delete/etc.)
// Mounted once in app/admin/layout.js so every admin page can call useToast()
// without wiring its own notification UI.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, tone) => {
      const id = nextId++;
      setToasts((t) => [...t, { id, message, tone }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  const value = {
    success: (message) => push(message, 'success'),
    error: (message) => push(message, 'error'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-md px-4 py-2.5 font-sans text-sm font-semibold text-white shadow-lg ${
              t.tone === 'error' ? 'bg-red-600' : 'bg-green-700'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider.');
  return ctx;
}
