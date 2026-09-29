import { useState } from "react";

export function CountryFlag({
  flagUrl,
  code,
  label,
  className = ""
}: {
  flagUrl: string | null;
  code: string | null;
  label: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!flagUrl || failed) {
    return code ? (
      <span
        className={`country-flag-fallback ${className}`}
        aria-label={`${label}：${code}`}
        title={code}
      >
        {code}
      </span>
    ) : null;
  }

  return (
    <img
      className={`country-flag ${className}`}
      src={flagUrl}
      alt={`${label}国旗`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}