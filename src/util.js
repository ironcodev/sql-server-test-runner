const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

function makeColorizer(enabled) {
  if (!enabled) return () => (s) => s;
  return (color, s) => `${COLORS[color] || ""}${s}${COLORS.reset}`;
}

export { COLORS, makeColorizer };
