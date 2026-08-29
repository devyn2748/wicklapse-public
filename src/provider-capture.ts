import type { ShareContext, TradeEpisode } from "./domain";
import { buildAxiomExecutionEpisodes } from "./axiom-capture";
import { buildFomoExecutionEpisodes } from "./fomo-capture";

export function buildProviderExecutionEpisodes(context: ShareContext): TradeEpisode[] {
  return context.provider === "fomo"
    ? buildFomoExecutionEpisodes(context)
    : buildAxiomExecutionEpisodes(context);
}
