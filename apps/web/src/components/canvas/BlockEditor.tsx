'use client';

import { useState } from 'react';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { cn } from '@/lib/utils';

interface BlockEditorProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  isSelected: boolean;
  readOnly?: boolean;
}

export function BlockEditor({ value, onChange, onFocus, isSelected, readOnly = false }: BlockEditorProps) {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const debouncedChange = useDebouncedCallback(onChange, 120);
  const displayedValue = editingValue ?? value;

  return (
    <textarea
      className={cn(
        'h-full w-full resize-none bg-transparent text-sm leading-relaxed outline-none',
        'placeholder:text-muted-foreground',
        readOnly && 'caret-transparent cursor-default',
      )}
      value={displayedValue}
      readOnly={readOnly}
      tabIndex={readOnly ? -1 : undefined}
      onChange={(e) => {
        if (readOnly) return;
        const next = e.target.value;
        setEditingValue(next);
        debouncedChange.run(next);
      }}
      onBlur={() => {
        if (readOnly) return;
        debouncedChange.flush();
        setEditingValue(null);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onFocus={() => {
        if (readOnly) return;
        onFocus?.();
      }}
      placeholder={readOnly ? undefined : 'Type here…'}
      autoFocus={isSelected && !readOnly}
    />
  );
}
