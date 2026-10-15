import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90 border border-transparent",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-muted",
  ghost: "bg-transparent text-ink border border-transparent hover:bg-surface-muted",
  danger: "bg-danger text-white border border-transparent hover:opacity-90 dark:text-[#1d0b08]",
};

export function buttonClasses(variant: Variant = "secondary", extra = ""): string {
  return [
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    extra,
  ].join(" ");
}

export function Button({
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}
