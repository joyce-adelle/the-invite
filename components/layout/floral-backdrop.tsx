import { cn } from "@/lib/utils";

/**
 * Cream blossoms with fine gold stamens and gold-olive leaves over a soft sage
 * wash, in the style of the flowers on the access card, drawn in the app's
 * cream, gold, olive and burgundy. Purely decorative: hidden from assistive
 * tech, never catches a click, and sits behind the page content. The
 * blossoms, buds and leaves are drawn once as symbols and reused.
 */
export function FloralBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}
      style={{
        background:
          "radial-gradient(70% 45% at 50% 0%, #ffffff 0%, rgb(255 255 255 / 0) 70%), linear-gradient(180deg, #fffefb 0%, #fbf9f5 60%, #f6f1e6 100%)",
      }}
    >
      <Symbols />
      <Corner className="-top-10 -left-16 w-60 opacity-70 sm:w-75 lg:-left-24 lg:w-105 lg:opacity-100" />
      <Corner className="-right-16 -bottom-10 w-60 rotate-180 opacity-70 sm:w-75 lg:-right-24 lg:w-105 lg:opacity-100" />
    </div>
  );
}

// A petal with a soft notch at the tip, pointing up from the origin.
const PETAL = "M0 -3 C-20 -10 -31 -40 -15 -53 C-8 -58 -2 -53 0 -47 C2 -53 8 -58 15 -53 C31 -40 20 -10 0 -3Z";

const STAMENS = Array.from({ length: 22 }, (_, i) => {
  const angle = (i * 360) / 22 + (i % 2) * 6;
  const length = 15 + ((i * 7) % 6);
  return { angle, length, tip: i % 4 === 0 };
});

function Symbols() {
  return (
    <svg width="0" height="0" className="absolute">
      <defs>
        <radialGradient id="fb-petal" cx="50%" cy="100%" r="100%" fx="50%" fy="100%">
          <stop offset="0" stopColor="#ecdf9a" />
          <stop offset=".35" stopColor="#fbf4cf" />
          <stop offset="1" stopColor="#fffef8" />
        </radialGradient>
        <filter id="fb-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="16" />
        </filter>

        <symbol id="fb-bloom" viewBox="-60 -60 120 120" overflow="visible">
          {Array.from({ length: 5 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 72})`}>
              <path d={PETAL} fill="url(#fb-petal)" stroke="#b39a4c" strokeOpacity=".6" strokeWidth=".9" />
              <path
                d="M0 -8 L0 -38 M-3 -9 Q-9 -26 -9 -38 M3 -9 Q9 -26 9 -38"
                stroke="#c9b266"
                strokeOpacity=".5"
                strokeWidth=".6"
                fill="none"
              />
            </g>
          ))}
          <circle r="7" fill="#dcc66c" fillOpacity=".7" />
          {STAMENS.map(({ angle, length, tip }) => (
            <g key={angle} transform={`rotate(${angle})`}>
              <line y1="-4" y2={-length} stroke="#a98a32" strokeOpacity=".8" strokeWidth=".7" />
              <circle cy={-length} r="1.3" fill={tip ? "#660033" : "#a98a32"} fillOpacity={tip ? 0.75 : 0.9} />
            </g>
          ))}
          <circle r="3" fill="#b8963a" />
        </symbol>

        <symbol id="fb-bud" viewBox="-20 -34 40 54" overflow="visible">
          <ellipse cx="-6" cy="-12" rx="7" ry="15" transform="rotate(-18 -6 -12)" fill="#fbf4cf" stroke="#b39a4c" strokeOpacity=".6" strokeWidth=".8" />
          <ellipse cx="6" cy="-12" rx="7" ry="15" transform="rotate(18 6 -12)" fill="#f6edbd" stroke="#b39a4c" strokeOpacity=".6" strokeWidth=".8" />
          <ellipse cy="-14" rx="7" ry="16" fill="#fffef8" stroke="#b39a4c" strokeOpacity=".6" strokeWidth=".8" />
          <path d="M-9 2 Q0 12 9 2 L6 10 Q0 15 -6 10Z" fill="#8a9a52" fillOpacity=".8" />
        </symbol>

        <symbol id="fb-leaf-gold" viewBox="0 -20 60 40" overflow="visible">
          <path d="M0 0 C10 -16 38 -20 58 0 C38 20 10 16 0 0Z" fill="#d6c274" fillOpacity=".7" stroke="#a98a32" strokeOpacity=".4" strokeWidth=".7" />
          <path d="M2 0 L50 0" stroke="#a98a32" strokeOpacity=".45" strokeWidth=".8" />
        </symbol>
        <symbol id="fb-leaf-olive" viewBox="0 -20 60 40" overflow="visible">
          <path d="M0 0 C10 -16 38 -20 58 0 C38 20 10 16 0 0Z" fill="#9aab72" fillOpacity=".6" stroke="#5e6b35" strokeOpacity=".4" strokeWidth=".7" />
          <path d="M2 0 L50 0" stroke="#5e6b35" strokeOpacity=".45" strokeWidth=".8" />
        </symbol>
      </defs>
    </svg>
  );
}

type Leaf = [kind: "gold" | "olive", x: number, y: number, rotate: number, scale: number];

const LEAVES: Leaf[] = [
  ["gold", 150, 30, -50, 1.2],
  ["olive", 200, 90, 20, 1.1],
  ["gold", 300, 120, 10, 1],
  ["olive", 330, 215, 35, 0.9],
  ["gold", 150, 235, 60, 1.2],
  ["olive", 90, 290, 80, 1.1],
  ["gold", 215, 300, 55, 0.9],
  ["gold", 20, 330, 95, 1],
  ["olive", 270, 200, -10, 0.85],
  ["gold", 380, 80, -30, 0.8],
  ["olive", 120, 160, 25, 0.9],
];

// x, y, size, rotation of each blossom.
const BLOOMS: [number, number, number, number][] = [
  [78, 84, 190, 12],
  [218, 168, 134, -22],
  [62, 238, 118, 34],
  [262, 52, 86, 48],
  [330, 150, 62, 5],
];

const BUDS: [number, number, number, number][] = [
  [150, 300, 34, 150],
  [318, 36, 30, 75],
  [20, 160, 30, 200],
];

const SPECKS: [number, number, number][] = [
  [345, 44, 3],
  [366, 84, 2],
  [180, 20, 2],
  [30, 380, 3],
  [74, 366, 2],
  [260, 250, 2.4],
  [300, 290, 2],
];

function Corner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={cn("absolute h-auto overflow-visible", className)}>
      {/* The soft sage wash behind the flowers. */}
      <g filter="url(#fb-soft)">
        <ellipse cx="90" cy="90" rx="140" ry="120" fill="#a9bd8f" fillOpacity=".38" />
        <ellipse cx="200" cy="210" rx="110" ry="90" fill="#c2d3a5" fillOpacity=".3" />
        <ellipse cx="60" cy="260" rx="80" ry="70" fill="#d8c78a" fillOpacity=".22" />
      </g>

      <g fill="none" stroke="#9a8a45" strokeOpacity=".6" strokeLinecap="round" strokeWidth="1.6">
        <path d="M-10 40 C100 70 190 120 250 300" />
        <path d="M60 -10 C90 110 190 170 340 214" />
        <path d="M-10 190 C60 200 120 250 150 340" />
        <path d="M200 60 C230 20 270 20 300 30" strokeWidth="1.2" />
      </g>

      {LEAVES.map(([kind, x, y, rotate, scale], i) => (
        <use
          key={i}
          href={`#fb-leaf-${kind}`}
          width="60"
          height="40"
          y="-20"
          transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}
        />
      ))}
      {BLOOMS.map(([x, y, size, rotate], i) => (
        <use
          key={i}
          href="#fb-bloom"
          x={-size / 2}
          y={-size / 2}
          width={size}
          height={size}
          transform={`translate(${x} ${y}) rotate(${rotate})`}
        />
      ))}
      {BUDS.map(([x, y, size, rotate], i) => (
        <use
          key={i}
          href="#fb-bud"
          x={-size / 2}
          y={-size / 2}
          width={size}
          height={size * 1.35}
          transform={`translate(${x} ${y}) rotate(${rotate})`}
        />
      ))}
      {SPECKS.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#c29b40" fillOpacity=".7" />
      ))}
    </svg>
  );
}
