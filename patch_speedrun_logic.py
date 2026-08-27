import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

speedrun_func = """
function calculateSpeedrunReveal(progress: number, startTimestamp: number, endTimestamp: number, trades: number[], interval: number): number {
  if (trades.length === 0 || endTimestamp <= startTimestamp) return replayEase(progress);
  
  const span = endTimestamp - startTimestamp;
  const segments = 200;
  const step = span / segments;
  const hotZoneRadius = Math.max(interval * 2, span * 0.05); // +/- 5% of timeline or 2 candles

  const weights = new Float64Array(segments);
  let totalWeight = 0;

  for (let i = 0; i < segments; i++) {
    const t = startTimestamp + i * step;
    let inHotZone = false;
    for (const trade of trades) {
      if (Math.abs(t - trade) <= hotZoneRadius) {
        inHotZone = true;
        break;
      }
    }
    const weight = inHotZone ? 6.0 : 1.0; // 6x slower in hot zones
    weights[i] = weight;
    totalWeight += weight;
  }

  const targetWeight = progress * totalWeight;
  let accumulated = 0;

  for (let i = 0; i < segments; i++) {
    const nextAccumulated = accumulated + weights[i];
    if (nextAccumulated >= targetWeight) {
      const fraction = (targetWeight - accumulated) / weights[i];
      return (i + fraction) / segments;
    }
    accumulated = nextAccumulated;
  }
  return 1;
}
"""

# Insert function before drawLandscapeReplayFrame
old_func_def = "function drawLandscapeReplayFrame("
new_func_def = speedrun_func + "\n" + old_func_def
code = code.replace(old_func_def, new_func_def)

# Landscape replacement
old_landscape_reveal = "const chartReveal = explicitTiming ? progress : replayEase(phase(progress, replayTiming.start, replayTiming.end));"
new_landscape_reveal = """  let chartReveal = explicitTiming ? progress : replayEase(phase(progress, replayTiming.start, replayTiming.end));
  if (config.speedrunMode && !explicitTiming) {
    const trades = spec.episode.fills.map(f => f.timestamp);
    chartReveal = calculateSpeedrunReveal(phase(progress, replayTiming.start, replayTiming.end), chartStart, chartEnd, trades, interval);
  }"""
code = code.replace(old_landscape_reveal, new_landscape_reveal, 1)

# Portrait replacement
old_portrait_reveal = "const chartReveal = explicitTiming ? progress : replayEase(phase(progress, replayTiming.start, replayTiming.end));"
new_portrait_reveal = """  let chartReveal = explicitTiming ? progress : replayEase(phase(progress, replayTiming.start, replayTiming.end));
  if (config.speedrunMode && !explicitTiming) {
    const trades = spec.episode.fills.map(f => f.timestamp);
    chartReveal = calculateSpeedrunReveal(phase(progress, replayTiming.start, replayTiming.end), chartStart, chartEnd, trades, interval);
  }"""
code = code.replace(old_portrait_reveal, new_portrait_reveal, 1) # Only replace the next occurrence (which should be in portrait)


with open('src/renderer.ts', 'w') as f:
    f.write(code)
