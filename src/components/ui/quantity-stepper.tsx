"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  name: string;
  id?: string;
  defaultValue: number;
  min: number;
  max: number;
  size?: "xs" | "sm";
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  /** When true, +/- and input changes submit the parent form after a
   *  short debounce. Use only on single-field forms — other fields
   *  would otherwise submit incomplete. */
  autoSubmit?: boolean;
}

export function QuantityStepper({
  name,
  id,
  defaultValue,
  min,
  max,
  size = "xs",
  required,
  disabled,
  ariaLabel,
  autoSubmit = false,
}: Props) {
  const [value, setValue] = useState<string>(String(defaultValue));
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard against redundant submits when the value didn't actually change
  // (e.g. blur firing right after a +/- click that already scheduled one).
  const lastSubmittedRef = useRef<string>(String(defaultValue));

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const clamp = (n: number): number => Math.max(min, Math.min(max, n));
  const current = (): number => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : defaultValue;
  };

  const scheduleSubmit = (next: string, delay: number): void => {
    if (!autoSubmit || disabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (next === lastSubmittedRef.current) return;
      lastSubmittedRef.current = next;
      inputRef.current?.form?.requestSubmit();
    }, delay);
  };

  const step = (delta: number): void => {
    if (disabled) return;
    const next = String(clamp(current() + delta));
    setValue(next);
    scheduleSubmit(next, 400);
  };

  const onInputChange = (raw: string): void => {
    setValue(raw);
    const n = Number.parseInt(raw, 10);
    if (Number.isInteger(n) && n >= min && n <= max) {
      scheduleSubmit(String(n), 800);
    } else if (timerRef.current) {
      // Invalid mid-typing — cancel any pending submit until they finish.
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onBlur = (): void => {
    const clamped = String(clamp(current()));
    setValue(clamped);
    scheduleSubmit(clamped, 0);
  };

  const isXs = size === "xs";
  const btnClass = isXs
    ? "size-7 shrink-0 rounded border border-input bg-background flex items-center justify-center text-base leading-none hover:bg-accent disabled:opacity-50 tabular-nums select-none"
    : "size-9 shrink-0 rounded border border-input bg-background flex items-center justify-center text-lg leading-none hover:bg-accent disabled:opacity-50 tabular-nums select-none";
  const inputClass = isXs
    ? "w-10 rounded border border-input bg-background px-1 py-0.5 text-xs tabular-nums text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
    : "w-14 rounded border border-input bg-background px-2 py-1.5 text-sm tabular-nums text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50";

  const curN = current();

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        aria-label="減少"
        className={btnClass}
        onClick={() => step(-1)}
        disabled={disabled || curN <= min}
      >
        −
      </button>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="number"
        min={min}
        max={max}
        step={1}
        inputMode="numeric"
        value={value}
        onChange={(e) => onInputChange(e.target.value)}
        onBlur={onBlur}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        className={inputClass}
      />
      <button
        type="button"
        aria-label="增加"
        className={btnClass}
        onClick={() => step(1)}
        disabled={disabled || curN >= max}
      >
        +
      </button>
    </div>
  );
}
