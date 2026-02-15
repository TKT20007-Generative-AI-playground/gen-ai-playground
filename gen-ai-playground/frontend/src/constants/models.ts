/**
 * Single source for model lists + display names + prices + descriptions.
 */

export const MODELS = [
  "FLUX2_KLEIN_9B",
  "FLUX2_KLEIN_4B",
  "FLUX1_KREA_DEV",
  "FLUX1_KONTEXT_DEV",
] as const

export const EDIT_MODELS = [
  "FLUX2_KLEIN_9B",
  "FLUX2_KLEIN_4B",
  "FLUX1_KONTEXT_DEV",
] as const

export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  FLUX2_KLEIN_9B: "FLUX.2 [klein] 9B",
  FLUX2_KLEIN_4B: "FLUX.2 [klein] 4B",
  FLUX1_KREA_DEV: "FLUX.1 Krea [dev]",
  FLUX1_KONTEXT_DEV: "FLUX.1 Kontext [dev]",
}

export const MODEL_PRICES: Record<string, string> = {
  FLUX2_KLEIN_9B: "$0.0030/image",
  FLUX2_KLEIN_4B: "$0.0020/image",
  FLUX1_KREA_DEV: "$0.0200/image",
  FLUX1_KONTEXT_DEV: "$0.0250/image",
}

/**
 * Descriptions WITHOUT the price line (price is stored separately above).
 * Use blank lines to create neat paragraph breaks.
 */
export const MODEL_DESCRIPTIONS: Record<string, string> = {
  FLUX2_KLEIN_9B: `Flagship compact model for real-time generation & multi-reference editing.

The flagship Klein variant tuned for fast, high-fidelity text-to-image and image editing. Delivers strong prompt adherence, clean detail, and dependable multi-reference composition for interactive creative workflows.`,

  FLUX2_KLEIN_4B: `Ultra-low latency image generation & editing for interactive apps.

The speed-first Klein variant for responsive experiences and high-throughput workloads. Ideal when you want rapid iteration while keeping strong prompt following and consistent compositions.`,

  FLUX1_KREA_DEV: `An open-weight model for creative and realistic image generation.

The next frontier in text-to-image generation, FLUX.1 Krea [dev] is an open-weight model that breaks away from the typical "AI look". The model is a close collaboration of Krea and Black Forest Labs.`,

  FLUX1_KONTEXT_DEV: `An open-weight, guidance-distilled version of Kontext.

FLUX.1 Kontext [dev] is the community-accessible variant of Kontext — distilled from FLUX.1 Kontext [pro] and released with open-weights. It preserves the pro-level editing fidelity, character consistency, and prompt following of the premium models, while being significantly more efficient and adaptable.`,
}

export function getModelDescription(model: string | undefined): string {
  if (!model) return "Select a model to see its description."
  return MODEL_DESCRIPTIONS[model] ?? "No description available for this model."
}

export function getModelDisplayName(model: string | undefined): string {
  if (!model) return "Model"
  return MODEL_DISPLAY_NAMES[model] ?? model
}

export function getModelPrice(model: string | undefined): string {
  if (!model) return ""
  return MODEL_PRICES[model] ?? ""
}
