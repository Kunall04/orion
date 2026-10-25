import { useEffect, useState } from 'react';

export interface ToastMessage {
  id: string;
  text: string;
  type?: 'info' | 'success' | 'warning';
}

let toastListener: ((toast: ToastMessage) => void) | null = null;

export function showToast(text: string, type: 'info' | 'success' | 'warning' = 'info') {
  if (toastListener) {
    toastListener({
      id: `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      text,
      type,
    });
  }
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    toastListener = (newToast) => {
      setToasts((prev) => [...prev, newToast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 2600);
    };

    return () => {
      toastListener = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-2 rounded-control border border-line bg-surface/95 px-3 py-2 text-[12px] font-medium text-ink shadow-raised backdrop-blur transition-all duration-200"
          style={{ animation: 'fade-up 200ms cubic-bezier(0.23, 1, 0.32, 1) both' }}
        >
          {toast.type === 'success' && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green text-white text-[10px]">
              ✓
            </span>
          )}
          {toast.type === 'warning' && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white text-[10px]">
              !
            </span>
          )}
          {(!toast.type || toast.type === 'info') && (
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          )}
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  );
}
