"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

type ModalProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClassName?: string;
};

export default function Modal({ open, title, onClose, children, footer, widthClassName = "max-w-lg" }: ModalProps) {
  const t = useTranslations("modal");
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      window.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-white rounded shadow-md w-[92vw] ${widthClassName} mx-4`}>
        <div className="border-b px-4 py-3 flex items-center justify-between">
          <div className="font-medium">{title}</div>
          <button
            type="button"
            aria-label={t("ariaClose")}
            className="text-gray-500 hover:text-gray-700"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="p-4 max-h-[70vh] overflow-auto">{children}</div>
        {footer && (
          <div className="border-t px-4 py-3 bg-gray-50 flex items-center justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>
  );
}


