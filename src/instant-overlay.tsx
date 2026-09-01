import { useCallback, useEffect, useRef, useState, type ChangeEvent, type JSX } from "react";
import { browser } from "wxt/browser";
import { normalizeWalletAddresses } from "./axiom-api";
import { BUNDLED_BACKDROPS, createCustomVideoBackdrop, disposeBundledBackdrop, isBundledVideoBackdrop, isVideoBackdrop, loadBundledBackdrop, type BundledBackdropMedia } from "./backdrops";
import { type ReplaySpec, type ShareContext } from "./domain";
import { selectCurrentTradeEpisode } from "./episodes";
import { buildProviderExecutionEpisodes } from "./provider-capture";
import { BUNDLED_SOUND_PRESETS, exportReplayVideo, playReplaySound, prepareReplaySound, replayEventOffset, replaySoundEvents, type SoundName } from "./export-video";
import { createReplaySpec, geckoFallbackWarning, isAbortError, LatestReplayRequest, openPositionEndSeconds, type CandleIntervalPreference } from "./replay-project";
import { drawReplayFrame, type BackgroundStyle, type ChartAnimation, type RenderConfig, type ThemeName, type TradeIndicatorStyle } from "./renderer";
import {
  loadStudioSettings,
  saveProject,
  saveShareContext,
  saveStudioSettings,
} from "./storage";
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from "./studio-settings";

const WICKLAPSE_VERSION = browser.runtime.getManifest().version;
const logoUrl = browser.runtime.getURL("/icon.png");

interface InstantOverlayProps {
  context: ShareContext;
  resolveContext?: (
    signal?: AbortSignal,
    manualWallets?: string[],
    onStatus?: (message: string) => void,
  ) => Promise<ShareContext>;
  onClose: () => void;
}

type View = "booting" | "trade-choice" | "instant" | "error";

interface RelatedTradeChoice {
  tradeCount: number;
  currentExecutions: number;
  combinedExecutions: number;
}

export interface CustomSound { id: string; name: string; buffer: AudioBuffer }

/** One uploaded sound is usable by both sides, so look it up in the shared pool. */
function customSoundBuffer(sound: SoundName, pool: CustomSound[]): AudioBuffer | null {
  if (!sound.startsWith("custom:")) return null;
  return pool.find((entry) => `custom:${entry.id}` === sound)?.buffer ?? null;
}

function Preview({ spec, settings, backgroundImage, customSounds }: { spec: ReplaySpec; settings: StudioSettings; backgroundImage: BundledBackdropMedia | null; customSounds: CustomSound[] }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const previousProgressRef = useRef(0);
  const soundedEventsRef = useRef(new Set<string>());
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const previewWidth = settings.aspectRatio === "9:16" ? 540 : 960;
  const previewHeight = settings.aspectRatio === "9:16" ? 960 : 540;
  const playbackDuration = isVideoBackdrop(backgroundImage) && Number.isFinite(backgroundImage.duration)
    ? backgroundImage.duration
    : settings.duration;
  const chartProgress = (playbackProgress: number) => Math.min(1, playbackProgress * playbackDuration / settings.duration);

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
        speedrunMode: settings.speedrunMode,
      }) / settings.duration;
      if (eventProgress <= previous || eventProgress > next || soundedEventsRef.current.has(fill.signature)) continue;
      soundedEventsRef.current.add(fill.signature);
      const sound = fill.side === "buy" ? settings.buySound : settings.sellSound;
      void playReplaySound(audio, sound, fill.side, customSoundBuffer(sound, customSounds));
    }
  }, [customSounds, previewHeight, previewWidth, settings.buySound, settings.chartLeadSeconds, settings.chartTrailSeconds, settings.duration, settings.sellSound, settings.speedrunMode, spec]);

  const draw = useCallback((next: number, playbackElapsedSeconds = next * settings.duration) => {
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
      tradeIndicatorStyle: settings.tradeIndicatorStyle,
      showAthLine: settings.showAthLine,
      marketCapFormat: settings.marketCapFormat,
      marketCapThreshold: settings.marketCapThreshold,
      width: canvas.width,
      height: canvas.height,
      backgroundImage,
      playbackElapsedSeconds,
    }, next);
  }, [backgroundImage, settings, spec]);

  useEffect(() => draw(chartProgress(progress), progress * playbackDuration), [draw, progress, playbackDuration, settings.duration]);
  useEffect(() => {
    if (!isVideoBackdrop(backgroundImage)) return;
    const video = backgroundImage;
    video.volume = 0.45;
    video.muted = false;
    if (playing) void video.play().catch(() => undefined);
    else video.pause();
    return () => video.pause();
  }, [backgroundImage, playing]);
  useEffect(() => {
    if (playing || !isVideoBackdrop(backgroundImage) || !Number.isFinite(backgroundImage.duration) || backgroundImage.duration <= 0) return;
    const desired = (progress * playbackDuration) % backgroundImage.duration;
    if (Math.abs(backgroundImage.currentTime - desired) > 0.04) backgroundImage.currentTime = desired;
  }, [backgroundImage, playbackDuration, playing, progress]);
  useEffect(() => {
    let active = true;
    void ensureAudio().then((audio) => Promise.all([
      prepareReplaySound(audio, settings.buySound, customSoundBuffer(settings.buySound, customSounds)),
      prepareReplaySound(audio, settings.sellSound, customSoundBuffer(settings.sellSound, customSounds)),
    ])).then(() => { if (active) setPlaying(true); }).catch(() => { if (active) setPlaying(true); });
    return () => { active = false; };
  }, [customSounds, ensureAudio, settings.buySound, settings.sellSound]);
  useEffect(() => () => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio && audio.state !== "closed") void audio.close();
  }, []);
  useEffect(() => {
    if (!playing) return;
    const started = performance.now() - progress * playbackDuration * 1_000;
    let frameId = 0;
    const frame = (now: number) => {
      const next = Math.min(1, (now - started) / (playbackDuration * 1_000));
      const nextChartProgress = chartProgress(next);
      soundCrossedEvents(previousProgressRef.current, nextChartProgress);
      previousProgressRef.current = nextChartProgress;
      setProgress(next);
      if (next >= 1) setPlaying(false);
      else frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [playbackDuration, playing, settings.duration, soundCrossedEvents]);

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
            } else previousProgressRef.current = chartProgress(progress);
            setPlaying(true);
          });
        }}>{playing ? "Ⅱ" : "▶"}</button>
        <input type="range" min={0} max={1} step={0.001} value={progress} onChange={(event) => {
          setPlaying(false);
          const next = Number(event.target.value);
          previousProgressRef.current = chartProgress(next);
          soundedEventsRef.current.clear();
          setProgress(next);
        }} />
        <span>{(progress * playbackDuration).toFixed(1)} / {playbackDuration.toFixed(1)}s</span>
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

export function InstantOverlay({ context, resolveContext, onClose }: InstantOverlayProps): JSX.Element {
  const [view, setView] = useState<View>("booting");
  const [relatedTradeChoice, setRelatedTradeChoice] = useState<RelatedTradeChoice | null>(null);
  const tradeChoiceResolverRef = useRef<((combine: boolean) => void) | null>(null);
  const [spec, setSpec] = useState<ReplaySpec | null>(null);
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  const [replayContext, setReplayContext] = useState<ShareContext | null>(null);
  const replayRequestRef = useRef(new LatestReplayRequest());
  const [status, setStatus] = useState("Preparing Wicklapse…");
  const [error, setError] = useState("");
  const [fallbackWalletInput, setFallbackWalletInput] = useState("");
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<BundledBackdropMedia | null>(null);
  const backgroundImageRef = useRef<BundledBackdropMedia | null>(null);
  const customBackdropInputRef = useRef<HTMLInputElement | null>(null);
  const [customBackdropName, setCustomBackdropName] = useState("");
  const customSoundInputRef = useRef<HTMLInputElement | null>(null);
  const customSoundSideRef = useRef<"buy" | "sell">("buy");
  const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);

  const requestRelatedTradeChoice = useCallback((choice: RelatedTradeChoice, signal: AbortSignal): Promise<boolean> => {
    if (signal.aborted) return Promise.reject(new DOMException("Replay request aborted", "AbortError"));
    setRelatedTradeChoice(choice);
    setView("trade-choice");
    return new Promise<boolean>((resolve, reject) => {
      const finish = (combine: boolean) => {
        signal.removeEventListener("abort", abort);
        tradeChoiceResolverRef.current = null;
        setRelatedTradeChoice(null);
        resolve(combine);
      };
      const abort = () => {
        tradeChoiceResolverRef.current = null;
        setRelatedTradeChoice(null);
        reject(new DOMException("Replay request aborted", "AbortError"));
      };
      tradeChoiceResolverRef.current = finish;
      signal.addEventListener("abort", abort, { once: true });
    });
  }, []);

  const buildCapturedReplay = useCallback(async (
    candleInterval: CandleIntervalPreference = "auto",
    timelineOptions?: { duration: number; leadSeconds: number | null; trailSeconds: number | null; openPnlToDate?: boolean },
    manualWallets: string[] = [],
  ) => {
    const request = replayRequestRef.current.begin();
    setError("");
    setView("booting");
    setStatus("Preparing Wicklapse…");
    setSpec(null);
    setReplayContext(null);
    setExportProgress(null);
    try {
      const providerName = context.provider === "fomo" ? "Fomo" : "Axiom";
      setStatus(`Retrieving the latest ${providerName} executions…`);
      const enrichedContext = resolveContext
        ? await resolveContext(request.signal, manualWallets, setStatus)
        : context;
      if (!enrichedContext.tradeExecutions?.length) throw new Error(`No replayable ${providerName} executions were returned for this trade.`);
      const providerTradeIds = new Set(enrichedContext.tradeExecutions.map((execution) => execution.providerTradeId).filter(Boolean));
      let replaySourceContext = enrichedContext;
      if (providerName === "Fomo" && providerTradeIds.size > 1) {
        const currentExecutions = enrichedContext.primaryTradeExecutions?.length
          ? enrichedContext.primaryTradeExecutions
          : enrichedContext.tradeExecutions.filter((execution) => execution.providerTradeId === enrichedContext.providerTradeId);
        const combine = await requestRelatedTradeChoice({
          tradeCount: providerTradeIds.size,
          currentExecutions: currentExecutions.length,
          combinedExecutions: enrichedContext.tradeExecutions.length,
        }, request.signal);
        if (!combine && currentExecutions.length) {
          replaySourceContext = {
            ...enrichedContext,
            tradeExecutions: currentExecutions,
            primaryTradeExecutions: currentExecutions,
            sourceText: `Fomo trade ${enrichedContext.providerTradeId ?? "selected"}`,
          };
        }
        setView("booting");
      }
      await saveShareContext(replaySourceContext);
      setReplayContext(replaySourceContext);
      const episodes = buildProviderExecutionEpisodes(replaySourceContext);
      const episode = selectCurrentTradeEpisode(episodes);
      if (!episode) {
        throw new Error(`No replayable buys or sells were found in this ${providerName} trade.`);
      }
      const providerTradeCount = new Set(replaySourceContext.tradeExecutions?.map((execution) => execution.providerTradeId).filter(Boolean)).size;
      setStatus(providerName === "Fomo" && providerTradeCount > 1
        ? `Combining ${providerTradeCount} nearby Fomo trades (${episode.fills.length} executions)…`
        : `Building from ${episode.fills.length} ${providerName} execution${episode.fills.length === 1 ? "" : "s"}…`);
      const specTimeline = timelineOptions
        ? { ...timelineOptions, openEndSeconds: openPositionEndSeconds(episode, replaySourceContext, timelineOptions.openPnlToDate ?? true) }
        : undefined;
      const nextSpec = await createReplaySpec(episode, replaySourceContext, replaySourceContext.walletAddress ?? "", candleInterval, request.signal, specTimeline, setStatus);
      if (!replayRequestRef.current.isLatest(request.id) || context.provider !== replaySourceContext.provider) return;
      setSpec(nextSpec);
      setError(geckoFallbackWarning(nextSpec));
      if (nextSpec.accountingCurrency === "USD") setSettings((current) => ({ ...current, currency: "USD" }));
      await saveProject({ shareContext: replaySourceContext, replaySpec: nextSpec, selectedEpisodeId: episode.id });
      setView("instant");
    } catch (caught) {
      if (isAbortError(caught) || !replayRequestRef.current.isLatest(request.id)) return;
      setError(caught instanceof Error ? caught.message : "The trade could not be resolved.");
      setView("error");
    }
  }, [context, resolveContext]);

  // Load persisted settings exactly once on mount. This must NOT re-run on
  // re-render: the overlay is re-rendered imperatively (openInstant passes a
  // fresh resolveContext each time), which changes buildCapturedReplay's
  // identity. Re-running setSettings here would overwrite whatever the user is
  // currently typing - e.g. the affiliate handle - which made that field
  // intermittently uneditable.
  useEffect(() => {
    let active = true;
    void loadStudioSettings()
      .then((savedSettings) => {
        if (!active) return;
        setSettings({
          ...savedSettings,
          width: 1920,
          height: 1080,
          buySound: savedSettings.buySound.startsWith("custom") ? "pulse" : savedSettings.buySound,
          sellSound: savedSettings.sellSound.startsWith("custom") ? "confirm" : savedSettings.sellSound,
          aspectRatio: savedSettings.aspectRatio ?? "16:9",
        });
      })
      .catch(() => undefined);
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)build the replay whenever the trade context changes. Reads settings for
  // the initial candle window but never writes them, so it cannot clobber edits.
  useEffect(() => {
    let active = true;
    void loadStudioSettings()
      .then((savedSettings) => {
        if (!active) return;
        void buildCapturedReplay(savedSettings.candleInterval ?? "auto", {
          duration: savedSettings.duration,
          leadSeconds: savedSettings.chartLeadSeconds,
          trailSeconds: savedSettings.chartTrailSeconds,
          openPnlToDate: savedSettings.openPositionPnl === "toDate",
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

  useEffect(() => {
    // A user upload owns the background slot; the bundled loader must not
    // overwrite it when the aspect ratio or an unrelated setting changes.
    if (settings.backgroundStyle === "custom") return;
    let active = true;
    void loadBundledBackdrop(settings.backgroundStyle, settings.aspectRatio).then((image) => {
      if (!active) {
        disposeBundledBackdrop(image);
        return;
      }
      disposeBundledBackdrop(backgroundImageRef.current);
      backgroundImageRef.current = image;
      setBackgroundImage(image);
    }).catch(() => {
      if (!active) return;
      disposeBundledBackdrop(backgroundImageRef.current);
      backgroundImageRef.current = null;
      setBackgroundImage(null);
    });
    return () => { active = false; };
  }, [settings.aspectRatio, settings.backgroundStyle]);

  useEffect(() => () => disposeBundledBackdrop(backgroundImageRef.current), []);

  const patch = <K extends keyof StudioSettings>(key: K, value: StudioSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  // Uploaded sounds go into one shared pool, so a file added from the buy menu
  // is immediately selectable in the sell menu and vice versa.
  const loadCustomSound = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setError("Choose an audio file (MP3, WAV, M4A or OGG).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Custom sounds must be 10 MB or smaller.");
      return;
    }
    try {
      const audio = new AudioContext();
      const buffer = await audio.decodeAudioData(await file.arrayBuffer());
      void audio.close();
      const id = crypto.randomUUID().slice(0, 8);
      const entry: CustomSound = { id, name: file.name.replace(/\.[^.]+$/, ""), buffer };
      setCustomSounds((current) => [...current, entry]);
      patch(customSoundSideRef.current === "buy" ? "buySound" : "sellSound", `custom:${id}` as SoundName);
      setError("");
    } catch {
      setError("This audio file could not be decoded by Chrome.");
    }
  };

  const pickCustomSound = (side: "buy" | "sell") => {
    customSoundSideRef.current = side;
    customSoundInputRef.current?.click();
  };

  // "Upload your own" in the backdrop dropdown. Images and videos share the
  // slot; the renderer cover-crops either one for 16:9 and 9:16 alike.
  const loadCustomBackdrop = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      setError("Choose an image or a video file for the background.");
      return;
    }
    if (file.size > (isVideo ? 100 : 20) * 1024 * 1024) {
      setError(isVideo ? "Background videos must be 100 MB or smaller." : "Background images must be 20 MB or smaller.");
      return;
    }
    try {
      const media: BundledBackdropMedia = isVideo
        ? await createCustomVideoBackdrop(file)
        : await createImageBitmap(file);
      disposeBundledBackdrop(backgroundImageRef.current);
      backgroundImageRef.current = media;
      setBackgroundImage(media);
      setCustomBackdropName(file.name);
      patch("backgroundStyle", "custom");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This background could not be loaded.");
    }
  };

  const changeOpenPositionPnl = async (mode: StudioSettings["openPositionPnl"]) => {
    patch("openPositionPnl", mode);
    if (!spec || !replayContext || spec.episode.status !== "open") return;
    const request = replayRequestRef.current.begin();
    try {
      const nextSpec = await createReplaySpec(spec.episode, replayContext, spec.walletAddress, settings.candleInterval, request.signal, {
        duration: settings.duration,
        leadSeconds: settings.chartLeadSeconds,
        trailSeconds: settings.chartTrailSeconds,
        openEndSeconds: openPositionEndSeconds(spec.episode, replayContext, mode === "toDate"),
      });
      if (!replayRequestRef.current.isLatest(request.id)) return;
      setSpec(nextSpec);
      setError(geckoFallbackWarning(nextSpec));
      await saveProject({ shareContext: replayContext, replaySpec: nextSpec, selectedEpisodeId: nextSpec.episode.id });
    } catch (caught) {
      if (isAbortError(caught) || !replayRequestRef.current.isLatest(request.id)) return;
      setError(caught instanceof Error ? caught.message : "Could not refresh the replay timeline.");
    }
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
          openEndSeconds: openPositionEndSeconds(spec.episode, replayContext, settings.openPositionPnl === "toDate"),
        });
        if (!replayRequestRef.current.isLatest(request.id)) return false;
        setSpec(nextSpec);
        setError(geckoFallbackWarning(nextSpec));
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
          openEndSeconds: openPositionEndSeconds(spec.episode, replayContext, settings.openPositionPnl === "toDate"),
        });
        if (!replayRequestRef.current.isLatest(request.id)) return false;
        setSpec(nextSpec);
        setError(geckoFallbackWarning(nextSpec));
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
        tradeIndicatorStyle: settings.tradeIndicatorStyle,
        showAthLine: settings.showAthLine,
        marketCapFormat: settings.marketCapFormat,
        marketCapThreshold: settings.marketCapThreshold,
        width: settings.aspectRatio === "9:16" ? 1080 : 1920,
        height: settings.aspectRatio === "9:16" ? 1920 : 1080,
        fps: 30,
        backgroundImage,
        outputDuration: isVideoBackdrop(backgroundImage) ? backgroundImage.duration : settings.duration,
      };
      const result = await exportReplayVideo(spec, config, {
        buySound: settings.buySound,
        sellSound: settings.sellSound,
        buyCustomBuffer: customSoundBuffer(settings.buySound, customSounds),
        sellCustomBuffer: customSoundBuffer(settings.sellSound, customSounds),
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
          <section className="wick-side-section"><div className="wick-section-title"><h3>Chart animation</h3><span>Default: Fixed full timeline</span></div><select className="wick-sound-select" value={settings.chartAnimation} onChange={(event) => patch("chartAnimation", event.target.value as ChartAnimation)}><option value="progressive">Progressive zoom</option><option value="follow">Rolling follow</option><option value="fixed">Fixed full timeline</option></select><p>Choose whether the camera expands with the trade, follows the active candle, or keeps the complete timeline fixed.</p><div className="wick-check-list" style={{ marginTop: '12px' }}><label className="wick-check"><input type="checkbox" checked={settings.speedrunMode} onChange={(event) => patch("speedrunMode", event.target.checked)} /><span><b>Cinematic Speedrun</b><small>Accelerates time between trades, slows down during trades.</small></span></label>{spec?.episode.status === "open" && <label className="wick-check"><input type="checkbox" checked={settings.openPositionPnl === "toDate"} onChange={(event) => void changeOpenPositionPnl(event.target.checked ? "toDate" : "trade")} /><span><b>P&L to date</b><small>Marks your remaining bag at the latest price instead of ending at your last fill.</small></span></label>}</div></section>
          <section className="wick-side-section"><div className="wick-section-title"><h3>Currency</h3><span>{settings.currency}</span></div><Segmented value={settings.currency} options={[{ value: "SOL", label: "SOL" }, { value: "USD", label: spec.usdPerSol ? "USD" : "USD unavailable" }]} onChange={(value) => spec.usdPerSol && patch("currency", value)} /></section>
          <section className="wick-side-section"><div className="wick-section-title"><h3>Trade indicators</h3><span>Feed default</span></div><select className="wick-sound-select" value={settings.tradeIndicatorStyle} onChange={(event) => patch("tradeIndicatorStyle", event.target.value as TradeIndicatorStyle)}><option value="detailed">Detailed · BUY $2.9K</option><option value="feed">Feed · animated text</option><option value="hype">Hype · neon two-line</option><option value="minimal">Minimal · + / − only</option></select><p>Choose how executions appear in the chart and replay export.</p></section>
          <section className="wick-side-section"><div className="wick-section-title"><h3>Timeline placement</h3><span>{settings.duration}s chart</span></div>
            <label>First buy at<input key={`instant-lead-${settings.chartLeadSeconds ?? "auto"}`} type="number" min={0} max={Math.max(0, settings.duration - 0.25)} step={0.25} defaultValue={settings.chartLeadSeconds ?? ""} placeholder="Auto · 0.12s" onBlur={(event) => { const input = event.currentTarget; const raw = input.value.trim(); const value = raw === "" ? null : Number(raw); if (value === null || (Number.isFinite(value) && value >= 0)) void changeChartTiming("chartLeadSeconds", value).then((changed) => { if (!changed) input.value = settings.chartLeadSeconds == null ? "" : String(settings.chartLeadSeconds); }); else input.value = settings.chartLeadSeconds == null ? "" : String(settings.chartLeadSeconds); }} /></label>
            <label>Chart after final sell<input key={`instant-trail-${settings.chartTrailSeconds ?? "auto"}`} type="number" min={0} max={Math.max(0, settings.duration - 0.25)} step={0.25} defaultValue={settings.chartTrailSeconds ?? ""} placeholder="Auto · 0.65s" onBlur={(event) => { const input = event.currentTarget; const raw = input.value.trim(); const value = raw === "" ? null : Number(raw); if (value === null || (Number.isFinite(value) && value >= 0)) void changeChartTiming("chartTrailSeconds", value).then((changed) => { if (!changed) input.value = settings.chartTrailSeconds == null ? "" : String(settings.chartTrailSeconds); }); else input.value = settings.chartTrailSeconds == null ? "" : String(settings.chartTrailSeconds); }} /></label>
            <small>Values are positions within the exported video. Clear either field to return it to Auto.</small>
          </section>
          <section className="wick-side-section"><div className="wick-section-title"><h3>Horizontal levels</h3><span>Optional</span></div><div className="wick-check-list">
            <label className="wick-check"><input type="checkbox" checked={settings.showAverageBuyLine} onChange={(event) => patch("showAverageBuyLine", event.target.checked)} /><span><b>Average Buy</b><small>Running token-volume-weighted buy price</small></span></label>
            <label className="wick-check"><input type="checkbox" checked={settings.showAverageSellLine} onChange={(event) => patch("showAverageSellLine", event.target.checked)} /><span><b>Average Sell</b><small>Updates after every partial or full sell</small></span></label>
            <label className="wick-check"><input type="checkbox" checked={settings.showAthLine} disabled={!spec.athMarketCapUsd} onChange={(event) => patch("showAthLine", event.target.checked)} /><span><b>Coin ATH</b><small>{spec.athMarketCapUsd ? "Line when reached in-clip; otherwise top badge" : "True ATH unavailable from this provider"}</small></span></label>
          </div></section>
          <section className="wick-side-section"><div className="wick-section-title"><h3>Affiliate / X Handle</h3><span>Optional</span></div><label>Link or @handle<input type="text" value={settings.affiliateLink} onChange={(event) => patch("affiliateLink", event.currentTarget.value)} onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()} placeholder="e.g. @username or t.me/link" maxLength={40} autoComplete="off" spellCheck={false} /></label></section>
          <section className="wick-side-section"><div className="wick-section-title"><h3>Custom chart length</h3><span>1–60 seconds</span></div><label>Chart duration<input key={`instant-duration-${settings.duration}`} type="number" min={1} max={60} step={0.25} defaultValue={settings.duration} onBlur={(event) => { const input = event.currentTarget; const value = Number(input.value); if (Number.isFinite(value) && value >= 1 && value <= 60 && value !== settings.duration) void changeDuration(value).then((changed) => { if (!changed) input.value = String(settings.duration); }); else input.value = String(settings.duration); }} /></label>{isBundledVideoBackdrop(settings.backgroundStyle) && <small>The chart completes in this time; the exported video continues to the end of the selected edit.</small>}</section>
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

        {view === "booting" && <main className="wick-loading"><span className="wick-spinner" /><h2>{status}</h2><p>{context.provider === "fomo" ? "Fomo" : "Axiom"} trade capture and rendering remain on this device.</p></main>}

        {view === "trade-choice" && relatedTradeChoice && <main className="wick-error-body wick-trade-choice"><div className="wick-kicker">RELATED TRADES FOUND</div><h1>Replay this trade or combine nearby activity?</h1><p>Fomo split this token into {relatedTradeChoice.tradeCount} position cycles within one hour. Combining them produces one continuous chart with cumulative P&amp;L.</p><div><button type="button" className="wick-secondary" onClick={() => tradeChoiceResolverRef.current?.(false)}>This trade only · {relatedTradeChoice.currentExecutions} executions</button><button type="button" className="wick-primary" onClick={() => tradeChoiceResolverRef.current?.(true)}>Combine {relatedTradeChoice.tradeCount} trades · {relatedTradeChoice.combinedExecutions} executions</button></div></main>}

        {view === "error" && <main className="wick-error-body"><div className="wick-kicker">TRADE LOOKUP</div><h1>We couldn’t retrieve this trade.</h1><p>{error}</p>{context.provider !== "fomo" && <label className="wick-wallet-fallback">Public Solana wallet address<input type="text" value={fallbackWalletInput} onChange={(event) => setFallbackWalletInput(event.target.value)} placeholder="Paste wallet address (comma-separate multiple)" /><small>Use this only if automatic Axiom wallet detection fails.</small></label>}<div><button type="button" className="wick-secondary" onClick={() => void buildCapturedReplay(settings.candleInterval, { duration: settings.duration, leadSeconds: settings.chartLeadSeconds, trailSeconds: settings.chartTrailSeconds, openPnlToDate: settings.openPositionPnl === "toDate" })}>Retry automatic</button>{context.provider !== "fomo" && <button type="button" className="wick-primary" onClick={() => { const wallets = normalizeWalletAddresses([fallbackWalletInput]); if (!wallets.length) { setError("Enter a valid public Solana wallet address."); return; } void buildCapturedReplay(settings.candleInterval, { duration: settings.duration, leadSeconds: settings.chartLeadSeconds, trailSeconds: settings.chartTrailSeconds, openPnlToDate: settings.openPositionPnl === "toDate" }, wallets); }}>Use wallet</button>}</div></main>}

        {view === "instant" && spec && <main className="wick-instant-body">
          <section className="wick-preview-column"><Preview key={`${spec.id}:${JSON.stringify(settings)}`} spec={spec} settings={settings} backgroundImage={backgroundImage} customSounds={customSounds} /></section>
          <section className="wick-controls">
            {error && <div className="wick-error" role="alert">{error}</div>}
            <div className="wick-control-section"><div className="wick-section-title"><h3>{isBundledVideoBackdrop(settings.backgroundStyle) ? "Chart duration" : "Video duration"}</h3><span>{settings.duration} seconds</span></div><Segmented value={settings.duration} options={[6, 8, 10, 12].map((value) => ({ value, label: `${value}s` }))} onChange={(value) => void changeDuration(value)} /></div>
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
  <select className="wick-sound-select" value={settings.backgroundStyle} onChange={(e) => {
    const value = e.target.value as BackgroundStyle;
    if (value === "custom") {
      customBackdropInputRef.current?.click();
      return;
    }
    patch("backgroundStyle", value);
  }}>
    <option value="glow">Ambient Glow</option>
    <option value="solid">Solid Color</option>
    <option value="grid">Retro Grid</option>
    <option value="particles">Particles</option>
    {BUNDLED_BACKDROPS.map((backdrop) => <option key={backdrop.value} value={backdrop.value}>{backdrop.label}</option>)}
    <option value="custom">Upload your own · image or video</option>
  </select>
  <input ref={customBackdropInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={(event) => void loadCustomBackdrop(event)} />
  {settings.backgroundStyle === "custom" && <p>{customBackdropName ? `Using ${customBackdropName}. ` : "Uploads are not kept after a reload. "}<button type="button" className="wick-linkish" onClick={() => customBackdropInputRef.current?.click()}>Choose a different file</button></p>}
</div>
<div className="wick-control-section">
  <div className="wick-section-title">
    <h3>Trade Indicators</h3>
    <span>{settings.tradeIndicatorStyle === "feed" ? "Feed" : settings.tradeIndicatorStyle[0]!.toUpperCase() + settings.tradeIndicatorStyle.slice(1)}</span>
  </div>
  <select className="wick-sound-select" value={settings.tradeIndicatorStyle} onChange={(event) => patch("tradeIndicatorStyle", event.target.value as TradeIndicatorStyle)}>
    <option value="detailed">Detailed · BUY $2.9K</option>
    <option value="feed">Feed · animated text</option>
    <option value="hype">Hype · neon two-line</option>
    <option value="minimal">Minimal · + / − only</option>
  </select>
</div>
            <div className="wick-control-grid wick-audio-grid">
              <div className="wick-control-section"><h3>Buy audio</h3><select className="wick-sound-select" value={settings.buySound} onChange={(event) => { const value = event.target.value; if (value === "upload") { pickCustomSound("buy"); return; } patch("buySound", value as SoundName); }}><optgroup label="Wicklapse"><option value="pulse">Pulse</option><option value="chime">Chime</option><option value="click">Click</option></optgroup><optgroup label="Sound pack">{BUNDLED_SOUND_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</optgroup>{customSounds.length > 0 && <optgroup label="Your uploads">{customSounds.map((entry) => <option key={entry.id} value={`custom:${entry.id}`}>{entry.name}</option>)}</optgroup>}<option value="upload">Upload your own…</option><option value="off">No sound</option></select></div>
              <div className="wick-control-section"><h3>Sell audio</h3><select className="wick-sound-select" value={settings.sellSound} onChange={(event) => { const value = event.target.value; if (value === "upload") { pickCustomSound("sell"); return; } patch("sellSound", value as SoundName); }}><optgroup label="Wicklapse"><option value="confirm">Confirm</option><option value="cash">Cash-out</option><option value="snap">Snap</option></optgroup><optgroup label="Sound pack">{BUNDLED_SOUND_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</optgroup>{customSounds.length > 0 && <optgroup label="Your uploads">{customSounds.map((entry) => <option key={entry.id} value={`custom:${entry.id}`}>{entry.name}</option>)}</optgroup>}<option value="upload">Upload your own…</option><option value="off">No sound</option></select></div>
              <input ref={customSoundInputRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={(event) => void loadCustomSound(event)} />
            </div>
            <div className="wick-export-zone">
              {exportProgress !== null && <div className="wick-export-progress"><span>Rendering locally</span><b>{Math.round(exportProgress * 100)}%</b><progress max={1} value={exportProgress} /></div>}
              <button type="button" className="wick-primary wick-export" disabled={exportProgress !== null} onClick={() => void exportVideo()}>{exportProgress !== null ? "Rendering…" : "Download"}</button>
              <div className="wick-bottom-actions"><button type="button" className="wick-secondary" onClick={() => setExpanded(true)}>Replay controls</button><button type="button" className="wick-secondary" onClick={() => setExpanded(true)}>Customize →</button></div>
            </div>
          </section>
        </main>}
        <footer className="wick-footer"><span>♢ {spec?.verified ? "On-chain verified" : spec ? `Captured from ${spec.provider === "fomo" ? "Fomo" : "Axiom"} · local-first` : "Local-first · private by default"}</span><b>v{WICKLAPSE_VERSION} · Rendered client-side</b></footer>
      </section>
      </div>
    </div>
  );
}
