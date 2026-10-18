import React, { useRef, useState, type ReactNode } from 'react';

export interface GlideMenuProps {
  children: ReactNode;
  className?: string;
  highlightClassName?: string;
  rowSelector?: string;
}

export default function GlideMenu({
  children,
  className = '',
  highlightClassName = 'inset-x-0 rounded-[8px] bg-hover',
  rowSelector = '[data-menu-row]',
}: GlideMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState<{ top: number; height: number } | null>(null);
  const [visible, setVisible] = useState(false);

  const update = (target: EventTarget | null) => {
    const container = containerRef.current;
    if (!(target instanceof Element) || !container) return;
    const row = target.closest(rowSelector);
    if (!(row instanceof HTMLElement) || !container.contains(row)) return;
    const cRect = container.getBoundingClientRect();
    const rRect = row.getBoundingClientRect();
    setHighlight({ top: rRect.top - cRect.top, height: rRect.height });
    setVisible(true);
  };

  return (
    <div
      ref={containerRef}
      onMouseOver={(e) => update(e.target)}
      onMouseLeave={() => setVisible(false)}
      onFocusCapture={(e) => update(e.target)}
      onBlurCapture={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
          setVisible(false);
        }
      }}
      className={`group/glide-menu relative ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute ${highlightClassName}`}
        style={{
          top: highlight?.top ?? 0,
          height: highlight?.height ?? 0,
          opacity: visible && highlight ? 1 : 0,
          transition:
            'top 220ms cubic-bezier(0.23, 1, 0.32, 1), height 220ms cubic-bezier(0.23, 1, 0.32, 1), opacity 150ms ease',
        }}
      />
      {children}
    </div>
  );
}
