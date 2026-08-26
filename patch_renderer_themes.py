import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

# 1. Update ThemeName and RenderConfig
code = code.replace(
    'export type ThemeName = "obsidian" | "neon" | "minimal";',
    'export type ThemeName = "obsidian" | "neon" | "minimal" | "cyberpunk" | "sunset" | "matrix" | "hacker";\nexport type BackgroundStyle = "glow" | "solid" | "grid" | "particles";'
)

code = code.replace(
    '  theme: ThemeName;',
    '  theme: ThemeName;\n  backgroundStyle: BackgroundStyle;'
)

# 2. Add themes to THEMES
themes_end = code.find('} as const;')
new_themes = """  cyberpunk: {
    background: "#0d0221",
    backgroundLift: "#1a0442",
    panel: "rgba(26, 4, 66, .88)",
    panelStrong: "rgba(26, 4, 66, .96)",
    grid: "rgba(255, 0, 85, .15)",
    border: "rgba(255, 0, 85, .25)",
    text: "#f0f0f0",
    muted: "#ff0055",
    positive: "#00ffcc",
    positiveSoft: "#80ffe6",
    negative: "#ff0055",
    accent: "#fcee0a",
  },
  sunset: {
    background: "#1a0b12",
    backgroundLift: "#331624",
    panel: "rgba(51, 22, 36, .88)",
    panelStrong: "rgba(51, 22, 36, .96)",
    grid: "rgba(255, 126, 103, .15)",
    border: "rgba(255, 126, 103, .25)",
    text: "#fdf5f3",
    muted: "#f0b6aa",
    positive: "#ff7e67",
    positiveSoft: "#ffbfb3",
    negative: "#804080",
    accent: "#ffc107",
  },
  matrix: {
    background: "#000000",
    backgroundLift: "#001a00",
    panel: "rgba(0, 26, 0, .88)",
    panelStrong: "rgba(0, 26, 0, .96)",
    grid: "rgba(0, 255, 0, .15)",
    border: "rgba(0, 255, 0, .25)",
    text: "#ccffcc",
    muted: "#009900",
    positive: "#00ff00",
    positiveSoft: "#80ff80",
    negative: "#990000",
    accent: "#ffffff",
  },
  hacker: {
    background: "#0a0a0a",
    backgroundLift: "#141414",
    panel: "rgba(20, 20, 20, .88)",
    panelStrong: "rgba(20, 20, 20, .96)",
    grid: "rgba(51, 255, 51, .1)",
    border: "rgba(51, 255, 51, .2)",
    text: "#33ff33",
    muted: "#1a801a",
    positive: "#33ff33",
    positiveSoft: "#99ff99",
    negative: "#ff3333",
    accent: "#000000",
  },
"""
code = code[:themes_end] + new_themes + code[themes_end:]

# 3. Update drawBackground
# Find drawBackground function body
bg_start = code.find('function drawBackground(')
bg_end = code.find('function drawLandscapeReplayFrame(', bg_start)

# We will completely replace drawBackground
new_bg = """function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: Theme,
  config: RenderConfig,
  progress: number,
): void {
  const unit = Math.min(width, height) / 1080;
  const isLandscape = width / height >= 1.45;

  context.fillStyle = theme.background;
  context.fillRect(0, 0, width, height);
  
  const style = config.backgroundStyle || "glow";

  if (style === "glow") {
    if (isLandscape) {
      const glow1 = context.createRadialGradient(width - 64 * unit, -64 * unit, 0, width - 64 * unit, -64 * unit, 480 * unit);
      glow1.addColorStop(0, `${theme.positive}22`);
      glow1.addColorStop(1, `${theme.positive}00`);
      context.fillStyle = glow1;
      context.fillRect(0, 0, width, height);

      const glow2 = context.createRadialGradient(width - 160 * unit, height, 0, width - 160 * unit, height, 400 * unit);
      glow2.addColorStop(0, `${theme.positive}11`);
      glow2.addColorStop(1, `${theme.positive}00`);
      context.fillStyle = glow2;
      context.fillRect(0, 0, width, height);
    } else {
      const glow1 = context.createRadialGradient(width - 40 * unit, -40 * unit, 0, width - 40 * unit, -40 * unit, 360 * unit);
      glow1.addColorStop(0, `${theme.positive}22`);
      glow1.addColorStop(1, `${theme.positive}00`);
      context.fillStyle = glow1;
      context.fillRect(0, 0, width, height);

      const glow2 = context.createRadialGradient(40 * unit, height - 40 * unit, 0, 40 * unit, height - 40 * unit, 360 * unit);
      glow2.addColorStop(0, `${theme.positive}15`);
      glow2.addColorStop(1, `${theme.positive}00`);
      context.fillStyle = glow2;
      context.fillRect(0, 0, width, height);
    }
  } else if (style === "grid") {
    context.strokeStyle = theme.grid;
    context.lineWidth = 1.5 * unit;
    const spacing = 80 * unit;
    for (let x = 0; x < width; x += spacing) {
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
    }
    for (let y = 0; y < height; y += spacing) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    }
  } else if (style === "particles") {
    context.fillStyle = theme.border;
    for (let i = 0; i < 150; i++) {
      // Deterministic pseudo-random based on index to avoid flicker
      const x = (Math.sin(i * 13) * 0.5 + 0.5) * width;
      const y = (Math.cos(i * 17) * 0.5 + 0.5) * height;
      const r = (Math.sin(i * 19) * 0.5 + 0.5) * 3 * unit + 1 * unit;
      context.beginPath(); context.arc(x, y, r, 0, Math.PI * 2); context.fill();
    }
  }

  context.strokeStyle = theme.border;
  context.lineWidth = Math.max(1, 1.5 * unit);
  const padding = 1.5 * unit;
  roundedRect(context, padding, padding, width - padding * 2, height - padding * 2, isLandscape ? 24 * unit : 40 * unit);
  context.stroke();
}
"""
code = code[:bg_start] + new_bg + code[bg_end:]

with open('src/renderer.ts', 'w') as f:
    f.write(code)
