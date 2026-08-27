import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { browser } from "wxt/browser";
import { fetchAxiomExecutions } from "./axiom-api";
import { fetchAxiomWalletAddresses } from "./axiom-wallets";
import { buildAxiomExecutionEpisodes } from "./axiom-capture";
import { type ReplaySpec, type ShareContext } from "./domain";
import { BUNDLED_SOUND_PRESETS, exportReplayVideo, playReplaySound, prepareReplaySound, replayEventOffset, replaySoundEvents, type SoundName } from "./export-video";
import { createReplaySpec, isAbortError, LatestReplayRequest, type CandleIntervalPreference } from "./replay-project";
import { drawReplayFrame, type BackgroundStyle, type ChartAnimation, type RenderConfig, type ThemeName } from "./renderer";
import {
  loadStudioSettings,
  loadTradingWalletAddresses,
  saveProject,
  saveShareContext,
  saveStudioSettings,
  saveTradingWalletAddresses,
} from "./storage";
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from "./studio-settings";
import logoUrl from "../assets/icon.png";

const WICKLAPSE_VERSION = browser.runtime.getManifest().version;

interface InstantOverlayProps {
  context: ShareContext;
  onClose: () => void;
}

type View = "booting" | "instant" | "error";

function Preview({ spec, settings }: { spec: ReplaySpec; settings: StudioSettings }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const previousProgressRef = useRef(0);
  const soundedEventsRef = useRef(new Set<string>());
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const previewWidth = settings.aspectRatio === "9:16" ? 540 : 960;
  const previewHeight = settings.aspectRatio === "9:16" ? 960 : 540;

  const ensureAudio = useCallback(async () => {
    const audio = audioRef.current ?? new AudioContext();
    audioRef.current = audio;
    if (audio.state === "suspended") await audio.resume();
    return audio;
  }, []);

  const soundCrossedEvents = useCallback((previous: number, next: number) => {
    if (next < previous) soundedEventsRef.current.clear();
    const audio = audioRef.current;
    if (!audio || audio.state !== "running") return;
    for (const fill of replaySoundEvents(spec)) {
      const eventProgress = replayEventOffset(fill, spec, {
        duration: settings.duration,
        width: previewWidth,
        height: previewHeight,
        chartLeadSeconds: settings.chartLeadSeconds,
        chartTrailSeconds: settings.chartTrailSeconds,
      }) / settings.duration;
      if (eventProgress <= previous || eventProgress > next || soundedEventsRef.current.has(fill.signature)) continue;
      soundedEventsRef.current.add(fill.signature);
      void playReplaySound(audio, fill.side === "buy" ? settings.buySound : settings.sellSound, fill.side);
    }
  }, [previewHeight, previewWidth, settings.buySound, settings.chartLeadSeconds, settings.chartTrailSeconds, settings.duration, settings.sellSound, spec]);

  const draw = useCallback((next: number) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    drawReplayFrame(context, { ...spec, currency: settings.currency }, {
      duration: settings.duration,
      currency: settings.currency,
      theme: settings.theme,
      backgroundStyle: settings.backgroundStyle,
      chartStyle: settings.chartStyle,
      affiliateLink: settings.affiliateLink,
      speedrunMode: settings.speedrunMode,
      exactValues: settings.exactValues,
      walletVisibility: settings.walletVisibility,
      chartMetric: settings.chartMetric,
      chartAnimation: settings.chartAnimation,
      chartLeadSeconds: settings.chartLeadSeconds,
      chartTrailSeconds: settings.chartTrailSeconds,
      showAverageBuyLine: settings.showAverageBuyLine,
      showAverageSellLine: settings.showAverageSellLine,
      showAthLine: settings.showAthLine,
      marketCapFormat: settings.marketCapFormat,
      marketCapThreshold: settings.marketCapThreshold,
      width: canvas.width,
      height: canvas.height,
    }, next);
  }, [settings, spec]);

  useEffect(() => draw(progress), [draw, progress]);
  useEffect(() => {
    let active = true;
    void ensureAudio().then((audio) => Promise.all([
      prepareReplaySound(audio, settings.buySound),
      prepareReplaySound(audio, settings.sellSound),
    ])).then(() => { if (active) setPlaying(true); }).catch(() => { if (active) setPlaying(true); });
    return () => { active = false; };
  }, [ensureAudio, settings.buySound, settings.sellSound]);
  useEffect(() => () => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio && audio.state !== "closed") void audio.close();
  }, []);
  useEffect(() => {
    if (!playing) return;
    const started = performance.now() - progress * settings.duration * 1_000;
    let frameId = 0;
    const frame = (now: number) => {
      const next = Math.min(1, (now - started) / (settings.duration * 1_000));
      soundCrossedEvents(previousProgressRef.current, next);
      previousProgressRef.current = next;
      setProgress(next);
      if (next >= 1) setPlaying(false);
      else frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [playing, settings.duration, soundCrossedEvents]);

  return (
    <div className="wick-preview">
      <canvas ref={canvasRef} width={previewWidth} height={previewHeight} />
      <div className="wick-playback">
        <button type="button" aria-label={playing ? "Pause" : "Play with sound"} onClick={() => {
          if (playing) {
            setPlaying(false);
            return;
          }
          void ensureAudio().catch(() => undefined).then(() => {
            if (progress >= 1) {
              previousProgressRef.current = 0;
              soundedEventsRef.current.clear();
              setProgress(0);
            } else previousProgressRef.current = progress;
            setPlaying(true);
          });
        }}>{playing ? "Ⅱ" : "▶"}</button>
        <input type="range" min={0} max={1} step={0.001} value={progress} onChange={(event) => {
          setPlaying(false);
          const next = Number(event.target.value);
          previousProgressRef.current = next;
          soundedEventsRef.current.clear();
          setProgress(next);
        }} />
        <span>{(progress * settings.duration).toFixed(1)} / {settings.duration}s</span>
      </div>
    </div>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}): JSX.Element {
  return <div className="wick-segmented">{options.map((option) => (
    <button type="button" key={option.value} className={value === option.value ? "is-selected" : ""} onClick={() => onChange(option.value)}>{option.label}</button>
  ))}</div>;
}

export function InstantOverlay({ context, onClose }: InstantOverlayProps): JSX.Element {
  const [view, setView] = useState<View>("booting");
  const [spec, setSpec] = useState<ReplaySpec | null>(null);
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  const [replayContext, setReplayContext] = useState<ShareContext | null>(null);
  const replayRequestRef = useRef(new LatestReplayRequest());
  const [status, setStatus] = useState("Preparing Wicklapse…");
  const [error, setError] = useState("");
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const buildCapturedReplay = useCallback(async (
    candleInterval: CandleIntervalPreference = "auto",
    timelineOptions?: { duration: number; leadSeconds: number | null; trailSeconds: number | null },
  ) => {
    const request = replayRequestRef.current.begin();
    setError("");
    setView("booting");
    setStatus("Preparing Wicklapse…");
    setSpec(null);
    setReplayContext(null);
    setExportProgress(null);
    try {
      if (!context.pairAddress) throw new Error("Open Wicklapse from an Axiom /meme/{pairAddress} coin page.");
      const savedWallets = await loadTradingWalletAddresses();
      let detectedWallets: string[] = [];
      try {
        detectedWallets = await fetchAxiomWalletAddresses({ signal: request.signal });
      } catch (caught) {
        if (!savedWallets.length) throw caught;
      }
      const walletAddresses = [...new Set([...detectedWallets, ...savedWallets])];
      if (!walletAddresses.length) {
        throw new Error("Axiom did not expose any Solana trading wallets. Confirm a public trading wallet is active in Axiom, then try again.");
      }
      if (detectedWallets.length) await saveTradingWalletAddresses(walletAddresses);
      setStatus(`Retrieving executions across ${walletAddresses.length} Axiom wallet${walletAddresses.length === 1 ? "" : "s"}…`);
      const tradeExecutions = await fetchAxiomExecutions(
        { pairAddress: context.pairAddress, walletAddresses },
        { signal: request.signal },
      );
      if (!tradeExecutions.length) {
        throw new Error("No trades found across the detected Axiom wallet(s) for this token.");
      }
      const enrichedContext: ShareContext = {
        ...context,
        tradeExecutions,
        walletAddresses,
        walletAddress: walletAddresses[0] ?? null,
        walletLabel: walletAddresses.length > 1 ? `${walletAddresses.length} wallets` : null,
      };
      await saveShareContext(enrichedContext);
      setReplayContext(enrichedContext);
      const episodes = buildAxiomExecutionEpisodes(enrichedContext);
      const episode = episodes[0];
      if (!episode) {
        throw new Error("No replayable buys or sells were found across the detected Axiom wallet(s).");
      }
      setStatus(`Building from ${episode.fills.length} Axiom execution${episode.fills.length === 1 ? "" : "s"}…`);
      const nextSpec = await createReplaySpec(episode, enrichedContext, enrichedContext.walletAddress ?? "", candleInterval, request.signal, timelineOptions);
      if (!replayRequestRef.current.isLatest(request.id) || context.pairAddress !== enrichedContext.pairAddress) return;
      setSpec(nextSpec);
      await saveProject({ shareContext: enrichedContext, replaySpec: nextSpec, selectedEpisodeId: episode.id });
      setView("instant");
    } catch (caught) {
      if (isAbortError(caught) || !replayRequestRef.current.isLatest(request.id)) return;
      setError(caught instanceof Error ? caught.message : "The trade could not be resolved.");
      setView("error");
    }
  }, [context]);

  useEffect(() => {
    let active = true;
    void loadStudioSettings()
      .then((savedSettings) => {
        if (!active) return;
        setSettings({
          ...savedSettings,
          width: 1920,
          height: 1080,
          buySound: savedSettings.buySound === "custom" ? "pulse" : savedSettings.buySound,
          sellSound: savedSettings.sellSound === "custom" ? "confirm" : savedSettings.sellSound,
          aspectRatio: savedSettings.aspectRatio ?? "16:9",
        });
        void buildCapturedReplay(savedSettings.candleInterval ?? "auto", {
          duration: savedSettings.duration,
          leadSeconds: savedSettings.chartLeadSeconds,
          trailSeconds: savedSettings.chartTrailSeconds,
        });
      })
      .catch(() => {
        if (!active) return;
        void buildCapturedReplay();
      });
    return () => {
      active = false;
      replayRequestRef.current.cancel();
    };
  }, [buildCapturedReplay]);

  useEffect(() => {
    if (view === "instant") void saveStudioSettings(settings);
  }, [settings, view]);

  const patch = <K extends keyof StudioSettings>(key: K, value: StudioSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const changeDuration = async (duration: number) => {
    setError("");
    const effectiveLead = settings.chartLeadSeconds ?? 0.12;
    const effectiveTrail = settings.chartTrailSeconds ?? 0.65;
    if (effectiveLead + effectiveTrail > duration - 0.25) {
      setError("This duration is too short for the selected chart lead-in and tail.");
      return false;
    }
    if (spec && replayContext && (settings.chartLeadSeconds != null || settings.chartTrailSeconds != null)) {
      const request = replayRequestRef.current.begin();
      try {
        const nextSpec = await createReplaySpec(spec.episode, replayContext, spec.walletAddress, settings.candleInterval, request.signal, {
          duration,
          leadSeconds: settings.chartLeadSeconds,
          trailSeconds: settings.chartTrailSeconds,
        });
        if (!replayRequestRef.current.isLatest(request.id)) return false;
        setSpec(nextSpec);
        await saveProject({ shareContext: replayContext, replaySpec: nextSpec, selectedEpisodeId: nextSpec.episode.id });
      } catch (caught) {
        if (isAbortError(caught) || !replayRequestRef.current.isLatest(request.id)) return false;
        setError(caught instanceof Error ? caught.message : "Could not refresh the replay timeline.");
        return false;
      }
    }
    patch("duration", duration);
    return true;
  };

  const changeChartTiming = async (key: "chartLeadSeconds" | "chartTrailSeconds", value: number | null) => {
    setError("");
    const leadSeconds = key === "chartLeadSeconds" ? value : settings.chartLeadSeconds;
    const trailSeconds = key === "chartTrailSeconds" ? value : settings.chartTrailSeconds;
    const effectiveLead = leadSeconds ?? 0.12;
    const effectiveTrail = trailSeconds ?? 0.65;
    if (effectiveLead + effectiveTrail > settings.duration - 0.25) {
      setError("First-buy timing and post-sell padding must leave at least 0.25 seconds for the trade.");
      return false;
    }
    if (spec && replayContext) {
      const request = replayRequestRef.current.begin();
      try {
        const nextSpec = await createReplaySpec(spec.episode, replayContext, spec.walletAddress, settings.candleInterval, request.signal, {
          duration: settings.duration,
          leadSeconds,
          trailSeconds,
        });
        if (!replayRequestRef.current.isLatest(request.id)) return false;
        setSpec(nextSpec);
        await saveProject({ shareContext: replayContext, replaySpec: nextSpec, selectedEpisodeId: nextSpec.episode.id });
      } catch (caught) {
        if (isAbortError(caught) || !replayRequestRef.current.isLatest(request.id)) return false;
        setError(caught instanceof Error ? caught.message : "Could not refresh the replay timeline.");
        return false;
      }
    }
    patch(key, value);
    return true;
  };

  const exportVideo = async () => {
    if (!spec) return;
    setExportProgress(0);
    setError("");
    try {
      const config: RenderConfig = {
        duration: settings.duration,
        currency: settings.currency,
        theme: settings.theme,
      backgroundStyle: settings.backgroundStyle,
      chartStyle: settings.chartStyle,
      affiliateLink: settings.affiliateLink,
      speedrunMode: settings.speedrunMode,
        exactValues: settings.exactValues,
        walletVisibility: settings.walletVisibility,
        chartMetric: settings.chartMetric,
        chartAnimation: settings.chartAnimation,
        chartLeadSeconds: settings.chartLeadSeconds,
        chartTrailSeconds: settings.chartTrailSeconds,
        showAverageBuyLine: settings.showAverageBuyLine,
        showAverageSellLine: settings.showAverageSellLine,
        showAthLine: settings.showAthLine,
        marketCapFormat: settings.marketCapFormat,
        marketCapThreshold: settings.marketCapThreshold,
        width: settings.aspectRatio === "9:16" ? 1080 : 1920,
        height: settings.aspectRatio === "9:16" ? 1920 : 1080,
        fps: 30,
      };
      const result = await exportReplayVideo(spec, config, {
        buySound: settings.buySound,
        sellSound: settings.sellSound,
        eventVolume: 0.8,
      }, setExportProgress);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `wicklapse-${spec.symbol}-${Date.now()}.${result.extension}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Video export failed.");
    } finally {
      setExportProgress(null);
    }
  };

  return (
    <div className="wick-backdrop" role="dialog" aria-modal="false" aria-label="Wicklapse Instant">
      <div className={`wick-workspace${expanded && view === "instant" ? " is-expanded" : ""}`}>
      {expanded && view === "instant" && spec && <aside className="wick-side-panel" aria-label="Expanded replay controls">
        <div className="wick-side-header"><div><span>EXPANDED CONTROLS</span><strong>Replay controls</strong></div><button type="button" aria-label="Collapse controls" onClick={() => setExpanded(false)}>→</button></div>
        <div className="wick-side-content">
          <section className="wick-side-section"><div className="wick-section-title"><h3>Chart style</h3><span>Default: Candlestick</span></div><select className="wick-sound-select" value={settings.chartStyle} onChange={(event) => patch("chartStyle", event.target.value as any)}><option value="candlestick">Candlestick</option><option value="bar">Bar (OHLC)</option><option value="line">Line</option><option value="area">Area</option></select><p>Choose the visual style of the price action data.</p></section>
          <section className="wick-side-section"><div className="wick-section-title"><h3>Chart animation</h3><span>Default: Progressive</span></div><select className="wick-sound-select" value={settings.chartAnimation} onChange={(event) => patch("chartAnimation", event.target.value as ChartAnimation)}><option value="progressive">Progressive zoom</option><option value="follow">Rolling follow</option><option value="fixed">Fixed full timeline</option></select><p>Choose whether the camera expands with the trade, follows the active candle, or keeps the complete timeline fixed.</p><div className="wick-check-list" style={{ marginTop: '12px' }}><label className="wick-check"><input type="checkbox" checked={settings.speedrunMode} onChange={(event) => patch("speedrunMode", event.target.checked)} /><span><b>Cinematic Speedrun</b><small>Accelerates time between trades, slows down during trades.</small></span></label></div></section>
          <section className="wick-side-section"><div className="wick-section-title"><h3>Currency</h3><span>{settings.currency}</span></div><Segmented value={settings.currency} options={[{ value: "SOL", label: "SOL" }, { value: "USD", label: spec.usdPerSol ? "USD" : "USD unavailable" }]} onChange={(value) => spec.usdPerSol && patch("currency", value)} /></section>
          <section className="wick-side-section"><div className="wick-section-title"><h3>Timeline placement</h3><span>{settings.duration}s clip</span></div>
            <label>First buy at<input key={`instant-lead-${settings.chartLeadSeconds ?? "auto"}`} type="number" min={0} max={Math.max(0, settings.duration - 0.25)} step={0.25} defaultValue={settings.chartLeadSeconds ?? ""} placeholder="Auto · 0.12s" onBlur={(event) => { const input = event.currentTarget; const raw = input.value.trim(); const value = raw === "" ? null : Number(raw); if (value === null || (Number.isFinite(value) && value >= 0)) void changeChartTiming("chartLeadSeconds", value).then((changed) => { if (!changed) input.value = settings.chartLeadSeconds == null ? "" : String(settings.chartLeadSeconds); }); else input.value = settings.chartLeadSeconds == null ? "" : String(settings.chartLeadSeconds); }} /></label>
            <label>Chart after final sell<input key={`instant-trail-${settings.chartTrailSeconds ?? "auto"}`} type="number" min={0} max={Math.max(0, settings.duration - 0.25)} step={0.25} defaultValue={settings.chartTrailSeconds ?? ""} placeholder="Auto · 0.65s" onBlur={(event) => { const input = event.currentTarget; const raw = input.value.trim(); const value = raw === "" ? null : Number(raw); if (value === null || (Number.isFinite(value) && value >= 0)) void changeChartTiming("chartTrailSeconds", value).then((changed) => { if (!changed) input.value = settings.chartTrailSeconds == null ? "" : String(settings.chartTrailSeconds); }); else input.value = settings.chartTrailSeconds == null ? "" : String(settings.chartTrailSeconds); }} /></label>
            <small>Values are positions within the exported video. Clear either field to return it to Auto.</small>
          </section>
          <section className="wick-side-section"><div className="wick-section-title"><h3>Horizontal levels</h3><span>Optional</span></div><div className="wick-check-list">
            <label className="wick-check"><input type="checkbox" checked={settings.showAverageBuyLine} onChange={(event) => patch("showAverageBuyLine", event.target.checked)} /><span><b>Average Buy</b><small>Running token-volume-weighted buy price</small></span></label>
            <label className="wick-check"><input type="checkbox" checked={settings.showAverageSellLine} onChange={(event) => patch("showAverageSellLine", event.target.checked)} /><span><b>Average Sell</b><small>Updates after every partial or full sell</small></span></label>
            <label className="wick-check"><input type="checkbox" checked={settings.showAthLine} disabled={!spec.athMarketCapUsd} onChange={(event) => patch("showAthLine", event.target.checked)} /><span><b>Coin ATH</b><small>{spec.athMarketCapUsd ? "Line when reached in-clip; otherwise top badge" : "True ATH unavailable from Axiom"}</small></span></label>
          </div></section>
          <section className="wick-side-section"><div className="wick-section-title"><h3>Affiliate / Referral</h3><span>Optional</span></div><label>Link text<input type="text" value={settings.affiliateLink} onChange={(event) => patch("affiliateLink", event.target.value)} placeholder="e.g. t.me/cryptojak" maxLength={40} /></label></section>
          <section className="wick-side-section"><div className="wick-section-title"><h3>Custom clip length</h3><span>1–60 seconds</span></div><label>Video duration<input key={`instant-duration-${settings.duration}`} type="number" min={1} max={60} step={0.25} defaultValue={settings.duration} onBlur={(event) => { const input = event.currentTarget; const value = Number(input.value); if (Number.isFinite(value) && value >= 1 && value <= 60 && value !== settings.duration) void changeDuration(value).then((changed) => { if (!changed) input.value = String(settings.duration); }); else input.value = String(settings.duration); }} /></label></section>
        </div>
        <div className="wick-side-footer">Changes restart the preview automatically.</div>
      </aside>}
      <section className={`wick-modal wick-${view}`}>
        <header className="wick-header">
          <div className="wick-brand"><img src={logoUrl} alt="Wicklapse Logo" /><strong>WICKLAPSE</strong>{view === "instant" && <span>INSTANT EXPORT</span>}</div>
          {spec && <div className="wick-trade">${spec.symbol} <b>{spec.episode.matchLabel} · {spec.episode.matchScore}%</b></div>}
          <div className="wick-header-actions">
            {view === "instant" && <button type="button" className={`wick-advanced${expanded ? " is-selected" : ""}`} aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? "Collapse controls →" : "Expand controls ←"}</button>}
            <button type="button" className="wick-close" aria-label="Close Wicklapse" onClick={onClose}>×</button>
          </div>
        </header>

        {view === "booting" && <main className="wick-loading"><span className="wick-spinner" /><h2>{status}</h2><p>Axiom trade capture and rendering remain on this device.</p></main>}

        {view === "error" && <main className="wick-error-body"><div className="wick-kicker">TRADE LOOKUP</div><h1>We couldn’t retrieve this trade.</h1><p>{error}</p><div><button type="button" className="wick-primary" onClick={onClose}>Close</button><button type="button" className="wick-secondary" onClick={() => void buildCapturedReplay(settings.candleInterval, { duration: settings.duration, leadSeconds: settings.chartLeadSeconds, trailSeconds: settings.chartTrailSeconds })}>Try again</button></div></main>}

        {view === "instant" && spec && <main className="wick-instant-body">
          <section className="wick-preview-column"><Preview key={`${spec.id}:${JSON.stringify(settings)}`} spec={spec} settings={settings} /></section>
          <section className="wick-controls">
            <div className="wick-control-section"><div className="wick-section-title"><h3>Video duration</h3><span>{settings.duration} seconds</span></div><Segmented value={settings.duration} options={[6, 8, 10, 12].map((value) => ({ value, label: `${value}s` }))} onChange={(value) => void changeDuration(value)} /></div>
            <div className="wick-control-section"><div className="wick-section-title"><h3>Aspect ratio</h3><span>{settings.aspectRatio}</span></div><Segmented value={settings.aspectRatio} options={[{ value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }]} onChange={(value) => patch("aspectRatio", value)} /></div>
            <div className="wick-control-section">
  <div className="wick-section-title">
    <h3>Visual Theme</h3>
    <span>Wicklapse</span>
  </div>
  <select className="wick-sound-select" value={settings.theme} onChange={(e) => patch("theme", e.target.value as ThemeName)}>
    <option value="obsidian">Obsidian</option>
    <option value="neon">Neon</option>
    <option value="minimal">Minimal</option>
    <option value="cyberpunk">Cyberpunk</option>
    <option value="sunset">Sunset</option>
    <option value="matrix">Matrix</option>
    <option value="hacker">Hacker</option>
  </select>
</div>
<div className="wick-control-section">
  <div className="wick-section-title">
    <h3>Background Design</h3>
    <span>Wicklapse</span>
  </div>
  <select className="wick-sound-select" value={settings.backgroundStyle} onChange={(e) => patch("backgroundStyle", e.target.value as BackgroundStyle)}>
    <option value="glow">Ambient Glow</option>
    <option value="solid">Solid Color</option>
    <option value="grid">Retro Grid</option>
    <option value="particles">Particles</option>
  </select>
</div>
            <div className="wick-control-grid wick-audio-grid">
              <div className="wick-control-section"><h3>Buy audio</h3><select className="wick-sound-select" value={settings.buySound} onChange={(event) => patch("buySound", event.target.value as SoundName)}><optgroup label="Wicklapse"><option value="pulse">Pulse</option><option value="chime">Chime</option><option value="click">Click</option></optgroup><optgroup label="Sound pack">{BUNDLED_SOUND_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</optgroup><option value="off">Off</option></select></div>
              <div className="wick-control-section"><h3>Sell audio</h3><select className="wick-sound-select" value={settings.sellSound} onChange={(event) => patch("sellSound", event.target.value as SoundName)}><optgroup label="Wicklapse"><option value="confirm">Confirm</option><option value="cash">Cash-out</option><option value="snap">Snap</option></optgroup><optgroup label="Sound pack">{BUNDLED_SOUND_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</optgroup><option value="off">Off</option></select></div>
            </div>
            <div className="wick-export-zone">
              {error && <div className="wick-error">{error}</div>}
              {exportProgress !== null && <div className="wick-export-progress"><span>Rendering locally</span><b>{Math.round(exportProgress * 100)}%</b><progress max={1} value={exportProgress} /></div>}
              <button type="button" className="wick-primary wick-export" disabled={exportProgress !== null} onClick={() => void exportVideo()}>{exportProgress !== null ? "Rendering…" : "Download"}</button>
              <div className="wick-bottom-actions"><button type="button" className="wick-secondary" onClick={() => setExpanded(true)}>Replay controls</button><button type="button" className="wick-secondary" onClick={() => setExpanded(true)}>Customize →</button></div>
            </div>
          </section>
        </main>}
        <footer className="wick-footer"><span>♢ {spec?.verified ? "On-chain verified" : spec ? "Captured from Axiom · local-first" : "Local-first · private by default"}</span><b>v{WICKLAPSE_VERSION} · Rendered client-side</b></footer>
      </section>
      </div>
    </div>
  );
}
