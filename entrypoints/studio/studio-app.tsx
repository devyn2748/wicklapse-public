import Decimal from "decimal.js";
import { browser } from "wxt/browser";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type JSX,
} from "react";
import {
  RpcSettingsSchema,
  ShareContextSchema,
  type Currency,
  type ReplaySpec,
  type RpcSettings,
  type ShareContext,
  type TradeEpisode,
  type TradeFill,
} from "../../src/domain";
import { normalizeWalletAddresses } from "../../src/axiom-api";
import { buildAxiomExecutionEpisodes } from "../../src/axiom-capture";
import { buildReplayPoints, buildTradeEpisodes, solFromLamports } from "../../src/episodes";
import { exportReplayVideo, type SoundName } from "../../src/export-video";
import { createReplaySpec } from "../../src/replay-project";
import { drawReplayFrame, type RenderConfig, type ThemeName, type WalletVisibility } from "../../src/renderer";
import { ensureRpcPermission, findWalletTradeFills, testRpcConnection } from "../../src/rpc";
import {
  loadProject,
  loadRpcSettings,
  loadShareContext,
  loadStudioSettings,
  loadTradingWalletAddresses,
  saveRpcSettings,
  saveStudioSettings,
  saveTradingWalletAddresses,
} from "../../src/storage";
import { ASPECT_PRESETS, DEFAULT_STUDIO_SETTINGS, type StudioSettings } from "../../src/studio-settings";

type Stage = "connect" | "confirm" | "studio";
const DEMO_MINT = "CybrLeek1111111111111111111111111111111111";

function demoFill(index: number, side: "buy" | "sell", quoteSol: string, price: string): TradeFill {
  const isLast = index === 7;
  return {
    signature: `demo${index}111111111111111111111111111111111111111111111111111111111111`,
    slot: 100 + index,
    timestamp: 1_777_123_090 + index * 105,
    side,
    tokenMint: DEMO_MINT,
    tokenDecimals: 6,
    tokenAmountRaw: "1000000",
    quoteLamports: new Decimal(quoteSol).mul(1_000_000_000).toFixed(0),
    networkFeeLamports: "5000",
    walletPostTokenRaw: isLast ? "0" : String((8 - index) * 1_000_000),
    estimatedPriceSol: price,
  };
}

export function makeDemoSpec(): ReplaySpec {
  const fills = [
    demoFill(0, "buy", "0.30", "0.000011"),
    demoFill(1, "buy", "0.28", "0.000015"),
    demoFill(2, "buy", "0.25", "0.000013"),
    demoFill(3, "sell", "2", "0.000026"),
    demoFill(4, "sell", "3", "0.000021"),
    demoFill(5, "sell", "4", "0.000031"),
    demoFill(6, "sell", "3", "0.000028"),
    demoFill(7, "sell", "3.19", "0.000036"),
  ];
  const episode: TradeEpisode = {
    id: "demo-episode",
    tokenMint: DEMO_MINT,
    fills,
    startTimestamp: fills[0]!.timestamp,
    endTimestamp: fills.at(-1)!.timestamp,
    status: "closed",
    totalBoughtLamports: "830000000",
    totalSoldLamports: "15190000000",
    networkFeesLamports: "40000",
    remainingTokenRaw: "0",
    tokenDecimals: 6,
    approximatePnlLamports: "14359960000",
    matchScore: 100,
    matchLabel: "Exact match",
  };
  return {
    id: "demo-replay",
    symbol: "CYBERLEEK",
    tokenMint: DEMO_MINT,
    walletAddress: "9LpWicklapseDemoWallet111111111111111111aBU",
    capturedAt: Date.now(),
    episode,
    points: [
      { timestamp: fills[0]!.timestamp, priceSol: fills[0]!.estimatedPriceSol, pnlSol: "-0.30" },
      { timestamp: fills[1]!.timestamp, priceSol: fills[1]!.estimatedPriceSol, pnlSol: "-0.58" },
      { timestamp: fills[2]!.timestamp, priceSol: fills[2]!.estimatedPriceSol, pnlSol: "-0.83" },
      { timestamp: fills[3]!.timestamp, priceSol: fills[3]!.estimatedPriceSol, pnlSol: "1.17" },
      { timestamp: fills[4]!.timestamp, priceSol: fills[4]!.estimatedPriceSol, pnlSol: "4.17" },
      { timestamp: fills[5]!.timestamp, priceSol: fills[5]!.estimatedPriceSol, pnlSol: "8.17" },
      { timestamp: fills[6]!.timestamp, priceSol: fills[6]!.estimatedPriceSol, pnlSol: "11.17" },
      { timestamp: fills[7]!.timestamp, priceSol: fills[7]!.estimatedPriceSol, pnlSol: "14.36" },
    ],
    currency: "SOL",
    usdPerSol: "180",
    verified: true,
    marketDataSource: "fills",
  };
}

function compactDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(timestamp * 1_000),
  );
}

function shortAddress(address: string): string {
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}

function WicklapseMark(): JSX.Element {
  return (
    <div className="brand" aria-label="Wicklapse">
      <svg viewBox="0 0 30 24" aria-hidden="true">
        <path d="M2 4.5 8 20 15 8.5 22 20 28 4.5" />
        <path className="brand-cap" d="M4 2h22" />
      </svg>
      <span>WICKLAPSE</span>
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
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          className={option.value === value ? "selected" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PreviewCanvas({
  spec,
  settings,
  backgroundImage,
}: {
  spec: ReplaySpec;
  settings: StudioSettings;
  backgroundImage: ImageBitmap | null;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(1);
  const startRef = useRef(0);

  const draw = useCallback(
    (nextProgress: number) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      drawReplayFrame(
        context,
        { ...spec, currency: settings.currency },
        {
          duration: settings.duration,
          currency: settings.currency,
          theme: settings.theme,
          exactValues: settings.exactValues,
          walletVisibility: settings.walletVisibility,
          chartMetric: settings.chartMetric,
          marketCapFormat: settings.marketCapFormat,
          marketCapThreshold: settings.marketCapThreshold,
          width: canvas.width,
          height: canvas.height,
          backgroundImage,
        },
        nextProgress,
      );
    },
    [backgroundImage, settings, spec],
  );

  useEffect(() => draw(progress), [draw, progress]);

  useEffect(() => {
    if (!playing) return;
    let frameId = 0;
    startRef.current = performance.now() - progress * settings.duration * 1_000;
    const frame = (now: number) => {
      const next = Math.min(1, (now - startRef.current) / (settings.duration * 1_000));
      setProgress(next);
      if (next >= 1) setPlaying(false);
      else frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [playing]);

  return (
    <div className="preview-shell">
      <div className="preview-safe-label">{settings.width}:{settings.height} preview</div>
      <canvas ref={canvasRef} width={Math.max(360, Math.round(720 * settings.width / Math.max(settings.width, settings.height)))} height={Math.max(360, Math.round(720 * settings.height / Math.max(settings.width, settings.height)))} aria-label="Wicklapse video preview" />
      <div className="playback">
        <button
          type="button"
          className="icon-button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            if (progress >= 1) setProgress(0);
            setPlaying((value) => !value);
          }}
        >
          {playing ? "Ⅱ" : "▶"}
        </button>
        <span>{(progress * settings.duration).toFixed(1)}s</span>
        <input
          aria-label="Preview timeline"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={(event) => {
            setPlaying(false);
            setProgress(Number(event.target.value));
          }}
        />
        <span>{settings.duration}s</span>
      </div>
    </div>
  );
}

function MusicTrimmer({
  buffer,
  clipDuration,
  start,
  onStartChange,
}: {
  buffer: AudioBuffer | null;
  clipDuration: number;
  start: number;
  onStartChange: (value: number) => void;
}): JSX.Element {
  const peaks = useMemo(() => {
    if (!buffer) return Array.from({ length: 68 }, (_, index) => 0.15 + ((index * 17) % 13) / 16);
    const data = buffer.getChannelData(0);
    const stride = Math.max(1, Math.floor(data.length / 68));
    return Array.from({ length: 68 }, (_, index) => {
      let peak = 0;
      const from = index * stride;
      const to = Math.min(data.length, from + stride);
      for (let sample = from; sample < to; sample += Math.max(1, Math.floor(stride / 80))) {
        peak = Math.max(peak, Math.abs(data[sample] ?? 0));
      }
      return Math.max(0.08, peak);
    });
  }, [buffer]);
  const maxStart = Math.max(0, (buffer?.duration ?? clipDuration) - clipDuration);
  return (
    <div className="waveform-card">
      <div className="waveform-head">
        <div>
          <strong>{buffer ? "Custom music" : "No music selected"}</strong>
          <span>Drag to choose the part used in your video</span>
        </div>
        <span>{start.toFixed(1)}s–{(start + clipDuration).toFixed(1)}s</span>
      </div>
      <div className="waveform" aria-hidden="true">
        {peaks.map((peak, index) => (
          <i key={index} style={{ height: `${Math.round(peak * 100)}%` }} />
        ))}
      </div>
      <input
        aria-label="Music segment start"
        type="range"
        min={0}
        max={maxStart}
        step={0.1}
        value={Math.min(start, maxStart)}
        disabled={!buffer || maxStart === 0}
        onChange={(event) => onStartChange(Number(event.target.value))}
      />
    </div>
  );
}

export function StudioApp(): JSX.Element {
  const [stage, setStage] = useState<Stage>("connect");
  const [context, setContext] = useState<ShareContext | null>(null);
  const [rpc, setRpc] = useState<RpcSettings>({
    walletAddress: "",
    provider: "helius",
    apiKey: "",
    endpoint: "",
    remember: false,
  });
  const [mint, setMint] = useState("");
  const [walletInput, setWalletInput] = useState("");
  const [episodes, setEpisodes] = useState<TradeEpisode[]>([]);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [spec, setSpec] = useState<ReplaySpec | null>(null);
  const [settings, setSettings] = useState(DEFAULT_STUDIO_SETTINGS);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<ImageBitmap | null>(null);
  const [musicBuffer, setMusicBuffer] = useState<AudioBuffer | null>(null);
  const [musicStart, setMusicStart] = useState(0);

  useEffect(() => {
    void Promise.all([loadShareContext(), loadRpcSettings(), loadProject(), loadStudioSettings(), loadTradingWalletAddresses()]).then(([share, savedRpc, project, savedSettings, savedWallets]) => {
      setSettings(savedSettings);
      setWalletInput(savedWallets.join(", "));
      if (share) {
        setContext(share);
        setMint(share.tokenMint ?? "");
      }
      if (savedRpc) setRpc(savedRpc);
      if (project?.replaySpec) {
        setContext(project.shareContext);
        setMint(project.shareContext.tokenMint ?? "");
        setSpec(project.replaySpec);
        setStage("studio");
      }
    });
  }, []);

  const selectedEpisode = episodes.find((episode) => episode.id === selectedEpisodeId) ?? episodes[0] ?? null;

  const patchSettings = <K extends keyof StudioSettings>(key: K, value: StudioSettings[K]) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      void saveStudioSettings(next);
      return next;
    });
  };

  const findTrade = async () => {
    setError("");
    const walletAddresses = normalizeWalletAddresses([walletInput]);
    if (!walletAddresses.length) {
      setError("Add at least one public Axiom trading wallet.");
      return;
    }
    await saveTradingWalletAddresses(walletAddresses);
    let resolvedContext = context;
    const cachedWallets = new Set(context?.walletAddresses ?? []);
    const needsRefresh = !context?.tradeExecutions?.length || walletAddresses.some((wallet) => !cachedWallets.has(wallet));
    if (needsRefresh) {
      setBusy(true);
      setProgressMessage("Retrieving exact executions from Axiom…");
      try {
        const response = await browser.runtime.sendMessage({
          type: "WICKLAPSE_REFRESH_AXIOM_TRADE",
          pairAddress: context?.pairAddress ?? null,
        }) as { ok?: boolean; context?: unknown; error?: string };
        if (!response?.ok) throw new Error(response?.error ?? "Axiom trade lookup failed.");
        const parsedContext = ShareContextSchema.safeParse(response.context);
        if (!parsedContext.success) throw new Error("Axiom returned trade data in an unsupported format.");
        resolvedContext = parsedContext.data;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Axiom trade lookup failed.");
        return;
      } finally {
        setBusy(false);
        setProgressMessage("");
      }
    }
    if (!resolvedContext?.tradeExecutions?.length) {
      setError("No trades found for the configured wallet(s) on this token.");
      return;
    }
    const matchingExecutions = resolvedContext.tradeExecutions.filter((execution) => walletAddresses.includes(execution.wallet));
    const sourceContext: ShareContext = {
      ...resolvedContext,
      tradeExecutions: matchingExecutions,
      walletAddresses,
      walletAddress: walletAddresses[0] ?? null,
      walletLabel: walletAddresses.length > 1 ? `${walletAddresses.length} wallets` : null,
    };
    const candidates = buildAxiomExecutionEpisodes(sourceContext);
    if (!candidates.length) {
      setError("No trades found for the configured wallet(s) on this token.");
      return;
    }
    setContext(sourceContext);
    setEpisodes(candidates);
    setSelectedEpisodeId(candidates[0]!.id);
    setStage("confirm");
  };

  const findTradeWithRpc = async () => {
    setError("");
    const parsed = RpcSettingsSchema.safeParse(rpc);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the RPC settings.");
      return;
    }
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
      setError("A valid token mint is required. If Axiom could not expose it, paste the mint manually.");
      return;
    }
    setBusy(true);
    try {
      setProgressMessage("Testing RPC connection…");
      await ensureRpcPermission(parsed.data);
      await testRpcConnection(parsed.data);
      await saveRpcSettings(parsed.data);
      const fills = await findWalletTradeFills(parsed.data, mint, setProgressMessage);
      const baseContext: ShareContext = context ?? {
        id: crypto.randomUUID(),
        capturedAt: Date.now(),
        pageUrl: "https://axiom.trade/",
        tokenMint: mint,
        pairAddress: null,
        symbol: "TOKEN",
        tokenName: null,
        walletAddress: null,
        walletLabel: null,
        boughtSol: null,
        soldSol: null,
        holdingSol: null,
        pnlSol: null,
        roiPercent: null,
        positionStatus: "unknown",
        sourceText: "",
      };
      const candidates = buildTradeEpisodes(fills, baseContext);
      if (!candidates.length) throw new Error("No complete trade episode could be reconstructed from the matching fills.");
      setEpisodes(candidates);
      setSelectedEpisodeId(candidates[0]!.id);
      setStage("confirm");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Trade lookup failed.");
    } finally {
      setBusy(false);
      setProgressMessage("");
    }
  };

  const useEpisode = async () => {
    if (!selectedEpisode) return;
    const sourceContext = context ?? {
      id: crypto.randomUUID(), capturedAt: Date.now(), pageUrl: "https://axiom.trade/", tokenMint: selectedEpisode.tokenMint,
      pairAddress: null, symbol: "TOKEN", tokenName: null, walletAddress: null, walletLabel: null, boughtSol: null,
      soldSol: null, holdingSol: null, pnlSol: null, roiPercent: null, positionStatus: "unknown" as const, sourceText: "",
    };
    const nextSpec = await createReplaySpec(selectedEpisode, sourceContext, sourceContext.walletAddress ?? rpc.walletAddress);
    setSpec(nextSpec);
    setStage("studio");
  };

  const exportVideo = async () => {
    if (!spec) return;
    setError("");
    setExportProgress(0);
    try {
      const renderConfig: RenderConfig = {
        duration: settings.duration,
        currency: settings.currency,
        theme: settings.theme,
        exactValues: settings.exactValues,
        walletVisibility: settings.walletVisibility,
        chartMetric: settings.chartMetric,
        marketCapFormat: settings.marketCapFormat,
        marketCapThreshold: settings.marketCapThreshold,
        width: settings.width,
        height: settings.height,
        fps: settings.fps,
        backgroundImage,
      };
      const result = await exportReplayVideo(
        spec,
        renderConfig,
        {
          buySound: settings.buySound,
          sellSound: settings.sellSound,
          musicBuffer,
          musicStart,
          musicVolume: 0.34,
          eventVolume: 0.8,
        },
        setExportProgress,
      );
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `wicklapse-${spec.symbol}-${new Date().toISOString().slice(0, 10)}.${result.extension}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Video export failed.");
    } finally {
      setExportProgress(null);
    }
  };

  const loadBackground = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("The first build supports image backgrounds. Video backgrounds are next in the Advanced pipeline.");
      return;
    }
    const bitmap = await createImageBitmap(file);
    backgroundImage?.close();
    setBackgroundImage(bitmap);
  };

  const loadMusic = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const audio = new AudioContext();
    try {
      const buffer = await audio.decodeAudioData(await file.arrayBuffer());
      setMusicBuffer(buffer);
      setMusicStart(0);
    } catch {
      setError("This audio file could not be decoded by Chrome.");
    } finally {
      await audio.close();
    }
  };

  const showDemo = () => {
    setSpec(makeDemoSpec());
    setStage("studio");
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <WicklapseMark />
        <div className="topbar-center">
          {stage === "connect" && <><b>1</b> Connect <span>→</span> Confirm <span>→</span> Customize</>}
          {stage === "confirm" && <>Connect <span>→</span> <b>2</b> Confirm <span>→</span> Customize</>}
          {stage === "studio" && <>{spec?.symbol ?? "Trade Replay"} <span>·</span> Saved locally</>}
        </div>
        <div className="status-chip"><i /> Local-first test build</div>
      </header>

      {stage === "connect" && (
        <main className="onboarding-page">
          <section className="hero-copy">
            <div className="eyebrow">AXIOM → WICKLAPSE</div>
            <h1>Turn the selected trade into motion.</h1>
            <p>Open Wicklapse from Axiom’s Share dialog. Wicklapse retrieves the selected token’s exact executions automatically for your saved public trading wallets.</p>
            <div className="capture-summary">
              <span className={context ? "ready-dot" : "idle-dot"} />
              <div>
                <strong>{context ? `$${context.symbol} share captured` : "No Axiom share captured yet"}</strong>
                <small>{context ? `${context.tokenMint ? shortAddress(context.tokenMint) : "Mint needs confirmation"} · captured ${new Date(context.capturedAt).toLocaleTimeString()}` : "You can still open the demo studio below."}</small>
              </div>
            </div>
          </section>

          <section className="connect-card">
            <div className="card-head">
              <div><span>Automatic Axiom lookup</span><h2>Generate replay</h2></div>
              <span className="private-badge">Stored locally</span>
            </div>
            <label>
              Public trading wallets
              <input value={walletInput} onChange={(event) => setWalletInput(event.target.value)} placeholder="Wallet 1, Wallet 2, …" />
              <small>Comma-separate multiple Axiom trading wallets. They are stored only in this Chrome profile.</small>
            </label>
            <label>
              Token mint
              <input value={mint} onChange={(event) => setMint(event.target.value.trim())} placeholder="Captured from Axiom Share" />
            </label>
            <button className="primary-button" type="button" disabled={busy} onClick={() => void findTrade()}>
              Generate Replay
            </button>
            <details>
              <summary>RPC fallback</summary>
              <label>
                RPC wallet address
                <input value={rpc.walletAddress} onChange={(event) => setRpc({ ...rpc, walletAddress: event.target.value.trim() })} placeholder="Single Solana wallet address" />
              </label>
            <div className="field-group">
              <span>RPC provider</span>
              <Segmented
                value={rpc.provider}
                options={[{ value: "helius", label: "Helius key" }, { value: "custom", label: "Custom RPC" }]}
                onChange={(provider) => setRpc({ ...rpc, provider })}
              />
            </div>
            {rpc.provider === "helius" ? (
              <label>
                Helius RPC key
                <input type="password" value={rpc.apiKey ?? ""} onChange={(event) => setRpc({ ...rpc, apiKey: event.target.value })} placeholder="API key" />
              </label>
            ) : (
              <label>
                RPC endpoint URL
                <input type="password" value={rpc.endpoint ?? ""} onChange={(event) => setRpc({ ...rpc, endpoint: event.target.value })} placeholder="https://…" />
              </label>
            )}
            <label className="check-row">
              <input type="checkbox" checked={rpc.remember} onChange={(event) => setRpc({ ...rpc, remember: event.target.checked })} />
              Remember on this browser
            </label>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => void findTradeWithRpc()}>
              {busy ? "Resolving with RPC…" : "Find using RPC fallback"}
            </button>
            </details>
            {progressMessage && <div className="progress-note"><span className="spinner" />{progressMessage}</div>}
            {error && <div className="error-box">{error}</div>}
            <button className="text-button" type="button" onClick={showDemo}>Preview with demo trade</button>
          </section>
        </main>
      )}

      {stage === "confirm" && (
        <main className="confirm-page">
          <div className="page-heading">
            <div className="eyebrow">FINALIZED WALLET ACTIVITY</div>
            <h1>Confirm this trade</h1>
            <p>Wicklapse grouped matching token swaps into separate position lifecycles.</p>
          </div>
          <div className="candidate-grid">
            {episodes.map((episode) => {
              const selected = episode.id === selectedEpisode?.id;
              return (
                <button type="button" className={`candidate-card ${selected ? "selected" : ""}`} key={episode.id} onClick={() => setSelectedEpisodeId(episode.id)}>
                  <div className="candidate-top">
                    <div><strong>${context?.symbol ?? "TOKEN"}</strong><span>{episode.status}</span></div>
                    <span className={`match-badge score-${episode.matchLabel.split(" ")[0]?.toLowerCase()}`}>{episode.matchLabel} · {episode.matchScore}%</span>
                  </div>
                  <div className="candidate-date">{compactDate(episode.startTimestamp)}–{compactDate(episode.endTimestamp)}</div>
                  <div className="candidate-stats">
                    <div><span>Buys</span><b>{episode.fills.filter((fill) => fill.side === "buy").length}</b></div>
                    <div><span>Sells</span><b>{episode.fills.filter((fill) => fill.side === "sell").length}</b></div>
                    <div><span>Bought</span><b>{solFromLamports(episode.totalBoughtLamports)} SOL</b></div>
                    <div><span>Sold</span><b>{solFromLamports(episode.totalSoldLamports)} SOL</b></div>
                  </div>
                  <div className="candidate-pnl"><span>Approx. closed P&L</span><strong>{solFromLamports(episode.approximatePnlLamports)} SOL</strong></div>
                </button>
              );
            })}
          </div>
          {error && <div className="error-box">{error}</div>}
          <div className="confirm-actions">
            <button className="secondary-button" type="button" onClick={() => setStage("connect")}>Back</button>
            <button className="primary-button compact" type="button" onClick={() => void useEpisode()}>Use this trade</button>
          </div>
        </main>
      )}

      {stage === "studio" && spec && (
        <main className="advanced-page">
          <nav className="tool-rail" aria-label="Advanced sections">
            {[
              ["composition", "▱", "Composition"], ["trade", "↗", "Trade"], ["chart", "⌁", "Chart"],
              ["background", "▧", "Background"], ["audio", "♫", "Audio"], ["privacy", "♢", "Privacy"], ["export", "⇩", "Export"],
            ].map(([id, icon, label]) => <button type="button" key={id} onClick={() => document.getElementById(`advanced-${id}`)?.scrollIntoView({ behavior: "smooth" })}><b>{icon}</b><span>{label}</span></button>)}
          </nav>

          <section className="advanced-canvas">
            <div className="canvas-toolbar">
              <div><strong>{settings.width === settings.height ? "1:1" : `${settings.width}:${settings.height}`} Canvas</strong><span>{settings.width} × {settings.height} · {settings.fps} FPS</span></div>
              <div><span>Guides: Safe Areas ON</span><b>85%</b></div>
            </div>
            <div className="canvas-stage">
              <PreviewCanvas spec={spec} settings={settings} backgroundImage={backgroundImage} />
            </div>
            {musicBuffer && <MusicTrimmer buffer={musicBuffer} clipDuration={settings.duration} start={musicStart} onStartChange={setMusicStart} />}
          </section>

          <aside className="advanced-inspector">
            <div className="inspector-heading"><div><span>MASTER CONFIG</span><h2>Composition & Export</h2></div><span className={spec.verified ? "verified" : "estimated"}>{spec.verified ? "Verified Data" : spec.tradeDataSource === "axiom" ? "Axiom Capture" : "Estimated"}</span></div>

            <section className="inspector-card" id="advanced-composition">
              <h3>▱ Composition setup</h3>
              <label className="inspector-label">Aspect ratio preset</label>
              <div className="aspect-presets">{ASPECT_PRESETS.map((preset) => <button type="button" key={preset.label} className={settings.width === preset.width && settings.height === preset.height ? "selected" : ""} onClick={() => {
                setSettings((current) => {
                  const next = { ...current, width: preset.width, height: preset.height };
                  void saveStudioSettings(next);
                  return next;
                });
              }}>{preset.label}</button>)}</div>
              <div className="inspector-grid">
                <label>Width<input type="number" min={320} max={3840} step={2} value={settings.width} onChange={(event) => patchSettings("width", Number(event.target.value))} /></label>
                <label>Height<input type="number" min={320} max={3840} step={2} value={settings.height} onChange={(event) => patchSettings("height", Number(event.target.value))} /></label>
                <div className="field-group"><span>Duration</span><Segmented value={settings.duration} options={[6, 8, 10, 12].map((value) => ({ value, label: `${value}s` }))} onChange={(value) => patchSettings("duration", value)} /></div>
                <div className="field-group"><span>Frame rate</span><Segmented value={settings.fps} options={[{ value: 30, label: "30 FPS" }, { value: 60, label: "60 FPS" }]} onChange={(value) => patchSettings("fps", value)} /></div>
              </div>
            </section>

            <section className="inspector-card" id="advanced-chart">
              <h3>⌁ Chart presentation</h3>
              <div className="inspector-grid">
                <div className="field-group"><span>Chart scale</span><Segmented value={settings.chartMetric} options={[{ value: "marketCap", label: spec.marketCapMultiplier ? "Market cap" : "MC unavailable" }, { value: "price", label: "Token price" }]} onChange={(value) => patchSettings("chartMetric", value)} /></div>
                <div className="field-group"><span>Market-cap labels</span><Segmented value={settings.marketCapFormat} options={[{ value: "auto", label: "Auto K/M" }, { value: "thousands", label: "Force K" }, { value: "millions", label: "Force M" }]} onChange={(value) => patchSettings("marketCapFormat", value)} /></div>
                <label>Auto K→M threshold<input type="number" min={1_000} max={1_000_000_000} step={100_000} value={settings.marketCapThreshold} onChange={(event) => patchSettings("marketCapThreshold", Math.max(1_000, Number(event.target.value) || 1_000_000))} /></label>
              </div>
              <label className="inspector-label">Scene sequencing</label>
              <div className="scene-grid"><span>Intro Scene ✓</span><span>Entry Tag ✓</span><span>Replay Path ✓</span><span>Exit Scene ✓</span><span>Final P&L Summary & Proof ✓</span></div>
              <label>Transition style<select><option>Smooth Zoom & Glow</option><option>Clean Cuts</option><option>High-Energy Pulse</option></select></label>
            </section>

            <section className="inspector-card" id="advanced-trade">
              <h3>↗ Trade presentation</h3>
              <div className="trade-mini"><div><span className="token-orb">W</span><div><strong>${spec.symbol}</strong><small>{spec.episode.status} · {spec.episode.fills.length} fills</small></div></div><span>{spec.episode.matchScore}% match</span></div>
              <label className="inspector-label">Visual theme</label>
              <div className="theme-list">{(["obsidian", "neon", "minimal"] as ThemeName[]).map((theme) => <button key={theme} type="button" className={settings.theme === theme ? "selected" : ""} onClick={() => patchSettings("theme", theme)}><i className={`theme-swatch ${theme}`} />{theme}</button>)}</div>
              <div className="inspector-grid">
                <div className="field-group"><span>Currency</span><Segmented value={settings.currency} options={[{ value: "SOL", label: "SOL" }, { value: "USD", label: spec.usdPerSol ? "USD" : "USD unavailable" }]} onChange={(value) => spec.usdPerSol && patchSettings("currency", value)} /></div>
                <div className="field-group"><span>Value format</span><Segmented value={settings.exactValues ? "exact" : "rounded"} options={[{ value: "rounded", label: "Rounded" }, { value: "exact", label: "Exact" }]} onChange={(value) => patchSettings("exactValues", value === "exact")} /></div>
              </div>
            </section>

            <section className="inspector-card" id="advanced-background">
              <h3>▧ Background & Media</h3>
              <div className="media-upload-grid"><label>Background image<input type="file" accept="image/*" onChange={(event) => void loadBackground(event)} /></label><label>Custom music<input type="file" accept="audio/*" onChange={(event) => void loadMusic(event)} /></label></div>
            </section>

            <section className="inspector-card" id="advanced-audio">
              <h3>♫ Event audio</h3>
              <div className="inspector-grid"><label>Buy sound<select value={settings.buySound} onChange={(event) => patchSettings("buySound", event.target.value as SoundName)}><option value="pulse">Pulse</option><option value="chime">Chime</option><option value="click">Click</option><option value="off">Off</option></select></label><label>Sell sound<select value={settings.sellSound} onChange={(event) => patchSettings("sellSound", event.target.value as SoundName)}><option value="confirm">Confirm</option><option value="cash">Cash-out</option><option value="snap">Snap</option><option value="off">Off</option></select></label></div>
            </section>

            <section className="inspector-card" id="advanced-privacy">
              <h3>♢ Privacy & On-chain proof</h3>
              <label className="inspector-label">Trader wallet visibility</label>
              <Segmented value={settings.walletVisibility} options={[{ value: "hidden", label: "Hidden" }, { value: "short", label: "Shortened" }, { value: "full", label: "Full" }]} onChange={(value) => patchSettings("walletVisibility", value as WalletVisibility)} />
              <div className="privacy-note"><b>No media uploads</b><span>Wallet data, backgrounds, and music remain in this browser.</span></div>
            </section>

            <section className="inspector-card export-card" id="advanced-export">
              <h3>⇩ Export video</h3>
              <dl><div><dt>Resolution</dt><dd>{settings.width} × {settings.height}</dd></div><div><dt>Duration</dt><dd>{settings.duration}s</dd></div><div><dt>Format</dt><dd>MP4 / WebM fallback</dd></div></dl>
              {exportProgress !== null && <div className="export-progress"><div><span>Rendering locally</span><b>{Math.round(exportProgress * 100)}%</b></div><progress max={1} value={exportProgress} /></div>}
              {error && <div className="error-box">{error}</div>}
              <button className="primary-button" type="button" disabled={exportProgress !== null} onClick={() => void exportVideo()}>{exportProgress !== null ? "Rendering…" : "Export Wicklapse Video"}</button>
              <button className="text-button" type="button" onClick={() => setStage(context ? "confirm" : "connect")}>Choose another trade</button>
            </section>
          </aside>
        </main>
      )}
    </div>
  );
}
