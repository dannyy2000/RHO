"use client";

import { useState } from "react";

interface FAQItem {
  q: string;
  a: string;
}

export default function FAQAccordion({ items }: { items: FAQItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="divide-y divide-slate-100">
      {items.map((item, i) => (
        <div key={i}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-4 py-5 text-left group"
          >
            <span className="text-sm font-semibold text-slate-900 group-hover:text-slate-600 transition-colors">
              {item.q}
            </span>
            <span
              className={`flex-shrink-0 w-5 h-5 rounded-full border border-slate-300 flex items-center justify-center transition-all duration-200 ${
                open === i ? "bg-slate-900 border-slate-900 rotate-45" : "bg-white"
              }`}
            >
              <svg
                className={`w-2.5 h-2.5 transition-colors ${open === i ? "text-white" : "text-slate-500"}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </span>
          </button>
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              open === i ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <p className="text-sm text-slate-500 leading-relaxed pb-5 pr-8">{item.a}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
