import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

# For Landscape
old_landscape_candles = """    for (const candle of animatedCandles) {
      const x = xForTime(candle.timestamp);
      const rising = candle.close >= candle.open;
      const color = rising ? theme.positive : theme.negative;
      context.strokeStyle = `${color}cc`;
      context.lineWidth = (2.2 + 1.2 * candle.local) * unit;
      context.shadowColor = color;
      context.shadowBlur = candle.local < 1 ? (1 - candle.local) * 20 * unit : 0;
      context.beginPath();
      context.moveTo(x, yForPrice(candle.high));
      context.lineTo(x, yForPrice(candle.low));
      context.stroke();
      context.shadowBlur = 0;
      const bodyTop = Math.min(yForPrice(candle.open), yForPrice(candle.close));
      const bodyHeight = Math.max(3 * unit, Math.abs(yForPrice(candle.open) - yForPrice(candle.close)));
      context.fillStyle = rising ? `${color}de` : `${color}c8`;
      context.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
      headX = x;
      headY = yForPrice(candle.close);
    }"""

new_landscape_candles = """    const style = config.chartStyle ?? "candlestick";
    if (style === "candlestick") {
      for (const candle of animatedCandles) {
        const x = xForTime(candle.timestamp);
        const rising = candle.close >= candle.open;
        const color = rising ? theme.positive : theme.negative;
        context.strokeStyle = `${color}cc`;
        context.lineWidth = (2.2 + 1.2 * candle.local) * unit;
        context.shadowColor = color;
        context.shadowBlur = candle.local < 1 ? (1 - candle.local) * 20 * unit : 0;
        context.beginPath();
        context.moveTo(x, yForPrice(candle.high));
        context.lineTo(x, yForPrice(candle.low));
        context.stroke();
        context.shadowBlur = 0;
        const bodyTop = Math.min(yForPrice(candle.open), yForPrice(candle.close));
        const bodyHeight = Math.max(3 * unit, Math.abs(yForPrice(candle.open) - yForPrice(candle.close)));
        context.fillStyle = rising ? `${color}de` : `${color}c8`;
        context.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
        headX = x;
        headY = yForPrice(candle.close);
      }
    } else if (style === "bar") {
      for (const candle of animatedCandles) {
        const x = xForTime(candle.timestamp);
        const rising = candle.close >= candle.open;
        const color = rising ? theme.positive : theme.negative;
        context.strokeStyle = `${color}e6`;
        context.lineWidth = Math.max(2 * unit, (2.2 + 1.2 * candle.local) * unit);
        context.lineCap = "round";
        context.lineJoin = "round";
        
        context.beginPath();
        context.moveTo(x, yForPrice(candle.high));
        context.lineTo(x, yForPrice(candle.low));
        context.moveTo(x - bodyWidth / 2, yForPrice(candle.open));
        context.lineTo(x, yForPrice(candle.open));
        context.moveTo(x, yForPrice(candle.close));
        context.lineTo(x + bodyWidth / 2, yForPrice(candle.close));
        context.stroke();
        
        headX = x;
        headY = yForPrice(candle.close);
      }
    } else if (style === "line" || style === "area") {
      context.beginPath();
      context.moveTo(xForTime(animatedCandles[0].timestamp), yForPrice(animatedCandles[0].close));
      for (let i = 1; i < animatedCandles.length; i++) {
        context.lineTo(xForTime(animatedCandles[i].timestamp), yForPrice(animatedCandles[i].close));
      }
      
      if (style === "area") {
        const gradient = context.createLinearGradient(0, plotY, 0, plotY + plotHeight);
        gradient.addColorStop(0, `${outcomeColor}66`);
        gradient.addColorStop(1, `${outcomeColor}00`);
        
        context.lineTo(xForTime(animatedCandles[animatedCandles.length - 1].timestamp), plotY + plotHeight);
        context.lineTo(xForTime(animatedCandles[0].timestamp), plotY + plotHeight);
        context.fillStyle = gradient;
        context.fill();
        
        // Redraw line on top
        context.beginPath();
        context.moveTo(xForTime(animatedCandles[0].timestamp), yForPrice(animatedCandles[0].close));
        for (let i = 1; i < animatedCandles.length; i++) {
          context.lineTo(xForTime(animatedCandles[i].timestamp), yForPrice(animatedCandles[i].close));
        }
      }
      
      context.strokeStyle = outcomeColor;
      context.lineWidth = 4 * unit;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.shadowColor = outcomeColor;
      context.shadowBlur = 12 * unit;
      context.stroke();
      context.shadowBlur = 0;
      
      headX = xForTime(animatedCandles[animatedCandles.length - 1].timestamp);
      headY = yForPrice(animatedCandles[animatedCandles.length - 1].close);
    }"""

code = code.replace(old_landscape_candles, new_landscape_candles, 2)

with open('src/renderer.ts', 'w') as f:
    f.write(code)
