import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

# Replace animatedCandles[X] with animatedCandles[X]!
code = code.replace("animatedCandles[0].timestamp", "animatedCandles[0]!.timestamp")
code = code.replace("animatedCandles[0].close", "animatedCandles[0]!.close")
code = code.replace("animatedCandles[i].timestamp", "animatedCandles[i]!.timestamp")
code = code.replace("animatedCandles[i].close", "animatedCandles[i]!.close")
code = code.replace("animatedCandles[animatedCandles.length - 1].timestamp", "animatedCandles[animatedCandles.length - 1]!.timestamp")
code = code.replace("animatedCandles[animatedCandles.length - 1].close", "animatedCandles[animatedCandles.length - 1]!.close")

with open('src/renderer.ts', 'w') as f:
    f.write(code)
