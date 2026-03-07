import axios from "axios"
import { useAuth } from "../context/AuthContext"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"

import { Button, MultiSelect, Paper, ScrollArea, Text, TextInput } from "@mantine/core"

type ModelOption = {
  value: string
  label: string
  slug: string
}

type Message = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
}

type Deployment = {
  name?: string
}

const makeMessageId = () => {
  // Prefer crypto.randomUUID when available; fall back for older browsers.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const MAX_MODELS = 4

const modelOptions: ModelOption[] = [
  {
    value: "deepseek-llm-7b",
    label: "DeepSeek LLM 7B",
    slug: "deepseek-llm-7b-chat",
  },
  {
    value: "Qwen3-8B",
    label: "Qwen 3 8B",
    slug: "qwen3-8b",
  },
  {
    value: "Qwen3-32B",
    label: "Qwen 3 32B",
    slug: "qwen3-32b",
  },
  {
    value: "Llama-3.1-8B",
    label: "Llama 3.1 8B",
    slug: "llama-3.1-8b-instruct",
  },
]

function parseModelReply(rawReply: string): {
  thinking: string | null
  actualReply: string
} {
  const thinkingMatch = rawReply.match(/<think>([\s\S]*?)<\/think>/)
  if (thinkingMatch) {
    const thinking = thinkingMatch[1].trim()
    const actualReply = rawReply.replace(/<think>[\s\S]*?<\/think>/, "").trim()
    return { thinking, actualReply }
  }
  return { thinking: null, actualReply: rawReply.trim() }
}

// --- Chat panel ---

type ChatPanelProps = {
  modelValue: string
  modelLabel: string
  backendUrl: string
  getAuthHeaders: () => Record<string, string>
  messages: Message[]
  onClearMessages: () => void
  isLoading: boolean
  isBusy: boolean
}

function ChatPanel({
  modelValue,
  modelLabel,
  backendUrl,
  getAuthHeaders,
  messages,
  onClearMessages,
  isLoading,
  isBusy,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  const selected = modelOptions.find((m) => m.value === modelValue) ?? null

  const deployContainer = async () => {
    if (!selected) return
    try {
      const deploymentsResponse = await axios.get(`${backendUrl}/text/deployments`, {
        headers: getAuthHeaders(),
      })
      const deployments = deploymentsResponse.data || []

      console.log("Deployments:", deployments)

      const existingContainer = deployments.find((d: Deployment) => {
        const name = typeof d?.name === "string" ? d.name.toLowerCase() : ""
        return name.includes(selected.slug.toLowerCase())
      })

      if (existingContainer) {
        console.log("Found existing container for model:", existingContainer.name)

        const connectResponse = await axios.post(
          `${backendUrl}/text/connect`,
          { deployment_name: existingContainer.name, model_path: modelValue },
          { headers: getAuthHeaders() }
        )
        console.log("Connected to existing container:", connectResponse.data)
        return connectResponse.data
      }

      console.log("No deployment found for model, creating new one...")

      const response = await axios.post(
        `${backendUrl}/text/deploy`,
        { model_path: modelValue },
        { headers: getAuthHeaders() }
      )
      console.log("Created new deployment:", response.data)
      return response.data
    } catch (error) {
      console.error(`Deploy error (${modelValue}):`, error)
    }
  }

  const deleteContainer = async () => {
    try {
      const response = await axios.delete(`${backendUrl}/text/deploy`, {
        headers: getAuthHeaders(),
      })
      console.log(`Delete (${modelValue}):`, response.data)
    } catch (error) {
      console.error(`Delete error (${modelValue}):`, error)
    }
  }

  const checkContainerStatus = async () => {
    try {
      const response = await axios.get(`${backendUrl}/text/status`, {
        headers: getAuthHeaders(),
      })
      console.log(`Status (${modelValue}):`, response.data)
    } catch (error) {
      console.error(`Status error (${modelValue}):`, error)
    }
  }

  return (
    <div
      style={{
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Text fw={700} mb={8}>
        {modelLabel}
      </Text>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
        <Button size="xs" onClick={deployContainer} disabled={isBusy}>
          Deploy
        </Button>
        <Button size="xs" onClick={checkContainerStatus} disabled={isBusy}>
          Status
        </Button>
        <Button size="xs" color="red" onClick={deleteContainer} disabled={isBusy}>
          Delete
        </Button>
        <Button size="xs" color="orange" onClick={onClearMessages} disabled={isBusy}>
          Clear
        </Button>
      </div>

      <ScrollArea
        style={{
          flex: 1,
          minHeight: "300px",
          maxHeight: "65vh",
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "12px",
        }}
      >
        {messages.length === 0 ? (
          <Text c="dimmed" ta="center" size="sm">
            No messages yet.
          </Text>
        ) : (
          messages.map((message) => (
            <Paper
              key={message.id}
              p="sm"
              mb="xs"
              style={{
                backgroundColor: message.role === "user" ? "#e3f2fd" : "#f5f5f5",
                marginLeft: message.role === "user" ? "15%" : "0",
                marginRight: message.role === "user" ? "0" : "15%",
              }}
            >
              <Text fw={700} size="xs" mb={4}>
                {message.role === "user" ? "You" : modelLabel}
              </Text>
              <Text
                size="sm"
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflowWrap: "break-word",
                }}
              >
                {message.content}
              </Text>
            </Paper>
          ))
        )}

        {isLoading && (
          <Text c="dimmed" size="sm" ta="center">
            Generating...
          </Text>
        )}
        <div ref={bottomRef} />
      </ScrollArea>
    </div>
  )
}

// --- Main component ---

export default function TextGenerator() {
  const { isLoggedIn, checkToken, getAuthHeaders } = useAuth()
  const backendUrl = import.meta.env.VITE_API_URL

  const [prompt, setPrompt] = useState("")
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [messagesByModel, setMessagesByModel] = useState<Record<string, Message[]>>({})
  const [loadingByModel, setLoadingByModel] = useState<Record<string, boolean>>({})

  // Keep a ref so async loops always see the latest messages.
  const messagesByModelRef = useRef<Record<string, Message[]>>({})

  const setMessagesForModel = (modelValue: string, next: Message[]) => {
    messagesByModelRef.current = { ...messagesByModelRef.current, [modelValue]: next }
    setMessagesByModel((prev) => ({ ...prev, [modelValue]: next }))
  }

  const clearMessagesForModel = (modelValue: string) => {
    setMessagesForModel(modelValue, [])
  }



  const getModelLabel = (value: string) => modelOptions.find((m) => m.value === value)?.label ?? value
  const isAnyLoading = selectedModels.some((m) => Boolean(loadingByModel[m]))

  const connectToModel = async (modelValue: string): Promise<boolean> => {
    const selected = modelOptions.find((m) => m.value === modelValue)
    if (!selected) return false

    try {
      const deploymentsResponse = await axios.get(`${backendUrl}/text/deployments`, {
        headers: getAuthHeaders(),
      })
      const deployments = deploymentsResponse.data || []

      const existingContainer = deployments.find((d: Deployment) => {
        const name = typeof d?.name === "string" ? d.name.toLowerCase() : ""
        return name.includes(selected.slug.toLowerCase())
      })

      if (!existingContainer) {
        console.error("No running deployment found for model:", modelValue)
        return false
      }

      await axios.post(
        `${backendUrl}/text/connect`,
        { deployment_name: existingContainer.name, model_path: modelValue },
        { headers: getAuthHeaders() }
      )
      console.log("Connected to deployment:", existingContainer.name)
      return true
    } catch (error) {
      console.error("Error connecting to model:", error)
      return false
    }
  }

  const chatWithCurrentModel = async (messages: Message[]): Promise<string | null> => {
    try {
      const response = await axios.post(
        `${backendUrl}/text/chat`,
        {
          messages,
          max_tokens: 256,
          temperature: 0.7,
          top_p: 0.9,
        },
        { headers: getAuthHeaders() }
      )

      const parsed = parseModelReply(response.data.reply)
      if (parsed.thinking) console.log("Model thinking:", parsed.thinking)
      return parsed.actualReply
    } catch (error) {
      console.error("Error during chat:", error)
      return null
    }
  }

  const generateText = async () => {
    if (!checkToken()) return
    if (!prompt.trim()) return
    if (selectedModels.length === 0) return

    const currentPrompt = prompt
    setPrompt("")
    const userMessage: Message = { id: makeMessageId(), role: "user", content: currentPrompt }

    for (const modelValue of selectedModels) {
      setLoadingByModel((prev) => ({ ...prev, [modelValue]: true }))

      const existingMessages = messagesByModelRef.current[modelValue] ?? []
      const updatedMessages = existingMessages.concat(userMessage)
      setMessagesForModel(modelValue, updatedMessages)

      const connected = await connectToModel(modelValue)
      if (connected) {
        const reply = await chatWithCurrentModel(updatedMessages)
        if (reply) {
          const withReply = updatedMessages.concat({ id: makeMessageId(), role: "assistant", content: reply })
          setMessagesForModel(modelValue, withReply)
        }
      }

      setLoadingByModel((prev) => ({ ...prev, [modelValue]: false }))
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      generateText()
    }
  }

  if (!isLoggedIn) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          padding: 40,
        }}
      >
        <p>You must be logged in to generate text.</p>
      </div>
    )
  }

  const isBreakout = selectedModels.length > 2

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        maxWidth: isBreakout ? "none" : "1100px",
        margin: "0 auto",
        padding: "20px",
        boxSizing: "border-box",
        overflowX: "visible",
        gap: "16px",
      }}
    >
      <Text c="dimmed" size="sm" mb={6}>
        Select up to {MAX_MODELS} models for text generation.
      </Text>

      <MultiSelect
        label="Models"
        placeholder={selectedModels.length > 0 ? "" : "Select models"}
        data={modelOptions}
        value={selectedModels}
        onChange={setSelectedModels}
        maxValues={MAX_MODELS}
        searchable
        clearable
        disabled={isAnyLoading}
      />

      {selectedModels.length > 0 && (
        <>
          {/* Panels */}
          {isBreakout ? (
            // 3–4 models: allow full-width layout and wrap panels instead of cramping.
            <div style={{ width: "100vw", marginLeft: "calc(50% - 50vw)" }}>
              <div
                style={{
                  maxWidth: "1800px",
                  margin: "0 auto",
                  padding: "0 16px",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gap: "20px",
                    width: "100%",
                    alignItems: "stretch",
                    gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
                  }}
                >
                  {selectedModels.map((modelValue) => (
                    <ChatPanel
                      key={modelValue}
                      modelValue={modelValue}
                      modelLabel={getModelLabel(modelValue)}
                      backendUrl={backendUrl}
                      getAuthHeaders={getAuthHeaders}
                      messages={messagesByModel[modelValue] ?? []}
                      onClearMessages={() => clearMessagesForModel(modelValue)}
                      isLoading={loadingByModel[modelValue] ?? false}
                      isBusy={isAnyLoading}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // 1–2 models: keep the compact layout.
            <div
              style={{
                display: "grid",
                gap: "20px",
                gridTemplateColumns:
                  selectedModels.length === 1 ? "minmax(320px, 1fr)" : "repeat(2, minmax(320px, 1fr))",
                width: "100%",
                margin: "0 auto",
                alignItems: "stretch",
              }}
            >
              {selectedModels.map((modelValue) => (
                <ChatPanel
                  key={modelValue}
                  modelValue={modelValue}
                  modelLabel={getModelLabel(modelValue)}
                  backendUrl={backendUrl}
                  getAuthHeaders={getAuthHeaders}
                  messages={messagesByModel[modelValue] ?? []}
                  onClearMessages={() => clearMessagesForModel(modelValue)}
                  isLoading={loadingByModel[modelValue] ?? false}
                  isBusy={isAnyLoading}
                />
              ))}
            </div>
          )}

          {/* Shared input */}
          <div style={{ display: "flex", gap: "10px" }}>
            <TextInput
              style={{ flex: 1, minWidth: 0 }}
              placeholder="Type your message to send to selected models..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isAnyLoading}
            />
            <Button onClick={generateText} disabled={!prompt.trim() || isAnyLoading} loading={isAnyLoading}>
              Send
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
