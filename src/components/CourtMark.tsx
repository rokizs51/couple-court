/**
 * Couple Court emblem: a court seal ring around the designed gavel, raised over a
 * heart on the sound block — love, on trial. Line work follows docs/design/01-home.png
 * (burgundy, round caps); the heart is the one gold accent. Decorative: the wordmark
 * beside it names the app. Colors come from tokens.css via currentColor / var(--gold).
 */
export function CourtMark({ size = 96 }: { size?: number }) {
  return (
    <svg className="home-mark" width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true" style={{ display: "block", flex: "none" }}>
      <circle cx="48" cy="48" r="45" stroke="currentColor" strokeWidth="2.5" />
      <g stroke="currentColor" strokeLinecap="round">
        <rect x="-17" y="-10" width="34" height="20" rx="6" transform="translate(61 31) rotate(45)" strokeWidth="4.5" />
        <path d="M52.9 39.1L40 52" strokeWidth="5" />
        <path d="M18 75h28" strokeWidth="5" />
      </g>
      <path
        d="M29 72.5C22.5 67 20 63.5 20 59.5c0-3.4 2.5-5.6 5.4-5.6 1.6 0 2.9.8 3.6 2.1.7-1.3 2-2.1 3.6-2.1 2.9 0 5.4 2.2 5.4 5.6 0 4-2.5 7.5-9 13Z"
        fill="var(--gold)"
      />
    </svg>
  );
}
