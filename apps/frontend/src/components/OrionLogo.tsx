export default function OrionLogo({
  size = 19,
  className = '',
  badge = false,
}: {
  size?: number;
  className?: string;
  badge?: boolean;
}) {
  if (badge) {
    return (
      <div
        className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-[#121316] border border-line-strong shadow-btn ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src="/logo.png"
          alt="Orion"
          className="h-full w-full object-contain p-0.5 select-none"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <img
      src="/logo.png"
      alt="Orion"
      style={{ width: size, height: size }}
      className={`shrink-0 object-contain invert dark:invert-0 select-none ${className}`}
      draggable={false}
    />
  );
}
