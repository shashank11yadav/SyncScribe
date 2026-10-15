export function Avatar({
  name,
  image,
  color,
  size = 28,
}: {
  name: string;
  image?: string | null;
  color?: string;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (image) {
    return (
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        className="rounded-full border border-line object-cover"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-full text-[0.7rem] font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: color ?? "#57534e" }}
    >
      {initials || "?"}
    </span>
  );
}
