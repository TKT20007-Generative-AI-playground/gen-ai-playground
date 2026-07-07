// Curated list of macOS-friendly Ollama models offered in the "start model from the app"
// flow. Kept small and Apple-Silicon-friendly (models that run comfortably on 16 GB RAM).
// `name` must match the exact Ollama pull tag.

export type LocalModelCatalogEntry = {
  name: string
  label: string
  description: string
  /** Approximate download size, shown before pulling. */
  size: string
}

export const LOCAL_MODEL_CATALOG: LocalModelCatalogEntry[] = [
  {
    name: "qwen2.5:0.5b",
    label: "Qwen 2.5 0.5B",
    description: "Tiniest usable model. Loads in seconds and runs on almost any machine.",
    size: "~0.4 GB",
  },
  {
    name: "llama3.2:1b",
    label: "Llama 3.2 1B",
    description: "Very small Meta model. Fast and light — good first test on a laptop.",
    size: "~1.3 GB",
  },
  {
    name: "gemma2:2b",
    label: "Gemma 2 2B",
    description: "Very small Google model. Runs almost anywhere.",
    size: "~1.6 GB",
  },
  {
    name: "llama3.2:3b",
    label: "Llama 3.2 3B",
    description: "Small, fast general-purpose chat model from Meta. Great default for laptops.",
    size: "~2 GB",
  },
  {
    name: "llama3.1:8b",
    label: "Llama 3.1 8B",
    description: "Larger, more capable Llama. Needs more memory but answers more accurately.",
    size: "~4.7 GB",
  },
  {
    name: "qwen2.5:7b",
    label: "Qwen 2.5 7B",
    description: "Strong multilingual and coding model from Alibaba.",
    size: "~4.7 GB",
  },
  {
    name: "phi4-mini",
    label: "Phi-4 Mini",
    description: "Compact reasoning-focused model from Microsoft.",
    size: "~2.5 GB",
  },
]
