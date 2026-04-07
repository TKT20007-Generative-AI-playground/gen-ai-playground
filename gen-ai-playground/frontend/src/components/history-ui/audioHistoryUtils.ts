import type { AudioRecord } from "./historyInterfaces"

export function getAudioInputTitle(item: Pick<AudioRecord, "input_name" | "source">): string {
  const inputName = item.input_name?.trim()
  if (inputName) {
    return inputName
  }

  if (item.source === "recording") {
    return "Live microphone recording"
  }

  if (item.source === "uploaded") {
    return "Uploaded audio file"
  }

  return "Audio transcription"
}

function titleizeWhisperModel(modelId: string): string {
  const compact = modelId.trim().toLowerCase()

  const directMap: Record<string, string> = {
    tiny: "Whisper Tiny",
    small: "Whisper Small",
    medium: "Whisper Medium",
    "large-v3-turbo": "Whisper Large v3 Turbo",
    "whisper-large-v3-turbo": "Whisper Large v3 Turbo",
    "large-v3": "Whisper Large v3",
    "whisper-large-v3": "Whisper Large v3",
    "large-v2": "Whisper Large v2",
    "whisper-large-v2": "Whisper Large v2",
  }

  if (directMap[compact]) {
    return directMap[compact]
  }

  if (compact.startsWith("whisper-")) {
    const body = compact.slice("whisper-".length)
    const pretty = body
      .split("-")
      .map(part => (part.match(/^v\d+$/i) ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1)))
      .join(" ")
    return `Whisper ${pretty}`
  }

  return modelId
}

export function formatAudioModelName(rawModel: string): string {
  const value = (rawModel ?? "").trim()
  if (!value) return "Unknown model"

  const withoutVendor = value.replace(/^openai\//i, "")
  const modelId = withoutVendor.includes("/") ? withoutVendor.split("/").pop() ?? withoutVendor : withoutVendor

  if (/^whisper\s/i.test(value)) {
    return value
  }

  return titleizeWhisperModel(modelId)
}
