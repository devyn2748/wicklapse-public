import { z } from "zod";

export const CurrencySchema = z.enum(["SOL", "USD"]);
export type Currency = z.infer<typeof CurrencySchema>;

export const SolanaAddressSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
const DecimalStringSchema = z.string().regex(/^\d+(?:\.\d+)?$/);

/** Provider-neutral execution data consumed by the replay pipeline. */
export const TradeExecutionSchema = z.object({
  side: z.enum(["buy", "sell"]),
  /** Unix seconds, preserving sub-second execution ordering when Axiom provides it. */
  timestamp: z.number().positive(),
  tokenAmount: DecimalStringSchema,
  priceSol: DecimalStringSchema,
  priceUsd: DecimalStringSchema,
  totalSol: DecimalStringSchema,
  totalUsd: DecimalStringSchema,
  wallet: SolanaAddressSchema,
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,96}$/),
  pairAddress: SolanaAddressSchema,
  source: z.literal("axiom"),
});

export type TradeExecution = z.infer<typeof TradeExecutionSchema>;

export const AxiomTradeEventSchema = z.object({
  id: z.string().min(1).max(160),
  side: z.enum(["buy", "sell"]),
  tokenAmount: z.string().regex(/^\d+(?:\.\d+)?$/).nullable(),
  quoteSol: z.string().regex(/^\d+(?:\.\d+)?$/),
  marketCapUsd: z.string().regex(/^\d+(?:\.\d+)?$/).nullable(),
  timestamp: z.number().int().positive().nullable(),
  displayAge: z.string().max(24).nullable(),
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,96}$/).nullable(),
  rowIndex: z.number().int().nonnegative(),
});

export type AxiomTradeEvent = z.infer<typeof AxiomTradeEventSchema>;

export const AxiomPairMetadataSchema = z.object({
  pairAddress: z.string(),
  tokenAddress: z.string().optional(),
  openTrading: z.string().optional(),
  pairCreatedAt: z.string().optional(),
  lastTransactionTime: z.string().optional(),
  isNew: z.string().optional(),
  isMigrated: z.string().optional(),
  v: z.string().optional(),
  showOutliers: z.string().optional(),
});

export type AxiomPairMetadata = z.infer<typeof AxiomPairMetadataSchema>;

export const AxiomPairContextSchema = z.object({
  pairAddress: z.string(),
  tokenAddress: z.string().nullable(),
  chartBaseUrl: z.string().url(),
  metadata: AxiomPairMetadataSchema,
  capturedAt: z.number().int().positive(),
});

export type AxiomPairContext = z.infer<typeof AxiomPairContextSchema>;

export const ShareContextSchema = z.object({
  id: z.string(),
  capturedAt: z.number().int().positive(),
  pageUrl: z.string().url(),
  tokenMint: z.string().nullable(),
  pairAddress: z.string().nullable(),
  symbol: z.string().min(1).max(32),
  tokenName: z.string().max(120).nullable(),
  tokenImageUrl: z.string().url().nullable().optional(),
  /** A safe pair-chart-v3 URL observed on the active Axiom page (no auth material). */
  axiomChartUrl: z.string().url().nullable().optional(),
  axiomPairContext: AxiomPairContextSchema.nullable().optional(),
  tradeExecutions: z.array(TradeExecutionSchema).max(5_000).optional(),
  tradeEvents: z.array(AxiomTradeEventSchema).max(250).optional(),
  walletAddresses: z.array(SolanaAddressSchema).max(25).optional(),
  walletAddress: z.string().nullable(),
  walletLabel: z.string().max(80).nullable(),
  boughtSol: z.string().nullable(),
  soldSol: z.string().nullable(),
  holdingSol: z.string().nullable(),
  pnlSol: z.string().nullable(),
  roiPercent: z.string().nullable(),
  positionStatus: z.enum(["open", "closed", "unknown"]),
  sourceText: z.string().max(20_000),
});

export type ShareContext = z.infer<typeof ShareContextSchema>;

export const RpcSettingsSchema = z
  .object({
    walletAddress: z
      .string()
      .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Enter a valid Solana wallet address."),
    provider: z.enum(["helius", "custom"]),
    apiKey: z.string().optional(),
    endpoint: z.string().url().optional(),
    remember: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.provider === "helius" && !value.apiKey?.trim()) {
      context.addIssue({ code: "custom", path: ["apiKey"], message: "A Helius API key is required." });
    }
    if (value.provider === "custom" && !value.endpoint?.trim()) {
      context.addIssue({ code: "custom", path: ["endpoint"], message: "An RPC endpoint is required." });
    }
    if (value.provider === "custom" && value.endpoint && URL.canParse(value.endpoint) && new URL(value.endpoint).protocol !== "https:") {
      context.addIssue({ code: "custom", path: ["endpoint"], message: "Custom RPC endpoints must use HTTPS." });
    }
  });

export type RpcSettings = z.infer<typeof RpcSettingsSchema>;

export type TradeSide = "buy" | "sell";

export interface TradeFill {
  signature: string;
  slot: number;
  timestamp: number;
  side: TradeSide;
  tokenMint: string;
  tokenDecimals: number;
  tokenAmountRaw: string;
  quoteLamports: string;
  networkFeeLamports: string;
  walletPostTokenRaw: string;
  estimatedPriceSol: string;
  executionPriceUsd?: string;
  totalUsd?: string;
  wallet?: string;
  pairAddress?: string;
  source?: "rpc" | "axiom";
}

export interface TradeEpisode {
  id: string;
  tokenMint: string;
  fills: TradeFill[];
  startTimestamp: number;
  endTimestamp: number;
  status: "open" | "closed";
  totalBoughtLamports: string;
  totalSoldLamports: string;
  networkFeesLamports: string;
  remainingTokenRaw: string;
  tokenDecimals: number;
  approximatePnlLamports: string;
  matchScore: number;
  matchLabel: "Exact match" | "Likely match" | "Possible match" | "Axiom capture";
}

export interface ReplayPoint {
  timestamp: number;
  priceSol: string;
  pnlSol: string;
}

export interface ReplayCandle {
  timestamp: number;
  openSol: string;
  highSol: string;
  lowSol: string;
  closeSol: string;
  volume: string;
}

export interface ReplaySpec {
  id: string;
  symbol: string;
  tokenMint: string;
  walletAddress: string;
  walletAddresses?: string[];
  capturedAt: number;
  episode: TradeEpisode;
  points: ReplayPoint[];
  candles?: ReplayCandle[];
  /** Multiply a candle's SOL-denominated token price by this value to obtain USD market cap. */
  marketCapMultiplier?: string | null;
  currency: Currency;
  usdPerSol: string | null;
  verified: boolean;
  marketDataSource?: "axiom" | "gecko" | "fills" | "ohlcv";
  candleIntervalSeconds?: number;
  tradeDataSource?: "rpc" | "axiom";
}

export interface StudioProject {
  shareContext: ShareContext;
  replaySpec: ReplaySpec | null;
  selectedEpisodeId: string | null;
}
