export interface ImageRecord {
  id: string
  username: string
  prompt: string
  model: string
  timestamp: string
  image_data: string
  image_type: string | null | undefined
}

export interface PromptGroup {
  prompt: string
  images: ImageRecord[]
}

export interface Message {
  role: string
  content: string
}

export interface TextRecord {
  response: string
  type: string
  messages: Message[]
  reply: string
  model: string
  timestamp: string
  username: string
  usage?: {
    prompt_tokens?: number
    total_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: string
    reasoning_tokens?: number
  }
  generation_time_ms?: number
}

export interface AudioRecord {
  type: string
  transcription_text: string
  model: string
  timestamp: string
  username: string
  run_id?: string
  input_name?: string
  language?: string
  duration?: number
  transcription_time_ms?: number
  source?: string
}

export interface VideoRecord {
  type: string
  prompt: string
  model: string
  timestamp: string
  username: string
  video_data: string
  mime_type: string
  generation_time_ms?: number
  height?: number
  width?: number
  num_frames?: number
  fps?: number
  seed?: number
}
export interface ConversationMessage {
  role: string
  content: string
  sender: string 
}

export interface ConversationRecord {
    _id: string
    title: string
    participants: string[]
    model: string
    messages: ConversationMessage[]
    invite_code: string
    created_at: string
}
