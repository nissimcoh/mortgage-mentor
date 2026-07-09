"use client";

export interface ScheduleOption {
  id: string;
  label: string;
}

interface ScheduleSelectorProps {
  options: ScheduleOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/** Accessible pill-style tab list for choosing which schedule to display. */
export default function ScheduleSelector({
  options,
  selectedId,
  onSelect,
}: ScheduleSelectorProps) {
  return (
    <div role="tablist" className="mb-3 flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = option.id === selectedId;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(option.id)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              isSelected
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
