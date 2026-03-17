import axios from "axios"
import { useAuth } from "../context/AuthContext"
import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react"

import {
  Alert,
  Button,
  MultiSelect,
  Paper,
  Text,
  ScrollArea,
  TextInput,
  Select,
  Group,
} from "@mantine/core"

type ModelOption = {
  value: string
  label: string
}

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  modelLabel?: string
}

type ModelStatus = "live" | "starting" | "offline" | "paused" | "unknown"

const makeMessageId = () => {
  // Prefer crypto.randomUUID when available; fall back for older browsers.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const MAX_MODELS = 4

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

const modelStatusPriority: Record<ModelStatus, number> = {
  live: 0,
  starting: 1,
  paused: 2,
  unknown: 3,
  offline: 4,
}

// Build dropdown data with colored status dots; only disable offline models
function buildDropdownData(
  modelOptions: ModelOption[],
  statuses: Record<string, ModelStatus>
) {
  return modelOptions
    .map((m) => {
      const st = statuses[m.value]
      const isSelectable = st !== "offline" && st !== "unknown"  // Allow live, starting, paused
      const emoji = st === "live" ? "\u{1F7E2}" : st === "starting" ? "\u{1F7E1}" : st === "paused" ? "\u{1F535}" : "\u26AA"

      return {
        value: m.value,
        label: `${emoji} ${m.label}`,
        disabled: !isSelectable,
      }
    })
    .sort((a, b) => {
      const statusDiff =
        modelStatusPriority[statuses[a.value]] -
        modelStatusPriority[statuses[b.value]]

      if (statusDiff !== 0) return statusDiff

      return a.label.localeCompare(b.label)
    })
}

// --- Chat panel (display only) ---

type ChatPanelProps = {
  modelValue: string
  modelLabel: string
  messages: Message[]
  onClearMessages: () => void
  isLoading: boolean
  isBusy: boolean
  modelStatus: ModelStatus
  statusMessage: string | null
}

function ChatPanel({
  modelLabel,
  messages,
  onClearMessages,
  isLoading,
  isBusy,
  modelStatus,
  statusMessage,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

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

      {modelStatus && modelStatus !== "live" && (
        <Alert
          color={modelStatus === "starting" ? "yellow" : modelStatus === "paused" ? "blue" : "gray"}
          variant="light"
          mb={8}
          p="xs"
          styles={{ message: { fontSize: 13 } }}
        >
          {statusMessage
            ? statusMessage
            : modelStatus === "starting"
              ? "This model is starting up. It usually takes about 2 minutes."
              : modelStatus === "paused"
                ? "This model is paused. Generating text will start it automatically (cold start ~2-5 min)."
                : "This model is not deployed. Ask an admin to deploy it from the dashboard."}
        </Alert>
      )}

      {modelStatus === "live" && statusMessage && (
        <Alert color="green" variant="light" mb={8} p="xs" styles={{ message: { fontSize: 13 } }}>
          {statusMessage}
        </Alert>
      )}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
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
          <>
            {messages.map((message) => (
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
                  {message.role === "user" ? "You" : message.modelLabel ?? modelLabel}
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
            ))}
            {isLoading && (
              <Text c="dimmed" size="sm" ta="center">
                Generating...
              </Text>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </ScrollArea>
    </div>
  )
}

// --- Main component ---

export default function TextGenerator() {
  const { isLoggedIn } = useAuth()
  const backendUrl = import.meta.env.VITE_API_URL

  const [prompt, setPrompt] = useState("")
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [messagesByModel, setMessagesByModel] = useState<Record<string, Message[]>>({})
  const [loadingByModel, setLoadingByModel] = useState<Record<string, boolean>>({})
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])

  // Deployment state
  const [deployModel, setDeployModel] = useState<string | null>(null)
  const [deployLoading, setDeployLoading] = useState(false)
  const [deployMsg, setDeployMsg] = useState<string | null>(null)

  // Keep a ref so async loops always see the latest messages.
  const messagesByModelRef = useRef<Record<string, Message[]>>({})

  const setMessagesForModel = (modelValue: string, next: Message[]) => {
    messagesByModelRef.current = { ...messagesByModelRef.current, [modelValue]: next }
    setMessagesByModel((prev) => ({ ...prev, [modelValue]: next }))
  }

  const clearMessagesForModel = (modelValue: string) => {
    setMessagesForModel(modelValue, [])
  }

  const [modelStatuses, setModelStatuses] = useState<Record<string, ModelStatus>>({})
  const [statusMsgs, setStatusMsgs] = useState<Record<string, string | null>>({})

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token")
    if (!token) throw new Error("Token puuttuu")
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }
  }

  // Fetch available models from backend
  useEffect(() => {
    if (!isLoggedIn) return
    const fetchModels = async () => {
      try {
        const res = await axios.get(`${backendUrl}/text/models`, {
          headers: getAuthHeaders(),
        })
        const models: ModelOption[] = (res.data.available_models ?? []).map(
          (m: { value: string; label: string }) => ({
            value: m.value,
            label: m.label,
          })
        )
        setModelOptions(models)
      } catch {
        // silent 
      }
    }
    fetchModels()
  }, [backendUrl, isLoggedIn])

  // Poll model statuses (background, for dropdown indicators)
  const fetchStatuses = useCallback(async () => {
    try {
      const res = await axios.get(`${backendUrl}/text/model-statuses`, {
        headers: getAuthHeaders(),
      })
      setModelStatuses(res.data)
    } catch {
      // silent
    }
  }, [backendUrl])

  useEffect(() => {
    if (!isLoggedIn) return
    fetchStatuses()
    const id = setInterval(fetchStatuses, 10000)
    return () => clearInterval(id)
  }, [fetchStatuses, isLoggedIn])

  const getModelLabel = (value: string) => modelOptions.find((m) => m.value === value)?.label ?? value
  const isAnyLoading = selectedModels.some((m) => Boolean(loadingByModel[m]))

  /**
   * Send message to a single model panel.
   * Only works with live/healthy models (dropdown enforces this).
   */
  const sendToPanel = async (
    modelValue: string,
    messagesWithUser: Message[],
  ) => {
    setLoadingByModel((prev) => ({ ...prev, [modelValue]: true }))
    console.log(`Sending to ${modelValue}:`, messagesWithUser)

    try {
      const response = await axios.post(
        `${backendUrl}/text/chat`,
        {
          model_path: modelValue,
          messages: messagesWithUser,
          max_tokens: 256,
          temperature: 0.7,
          top_p: 0.9,
        },
        { headers: getAuthHeaders() }
      )

      const result = response.data
      const parsed = parseModelReply(result.reply)
      if (parsed.thinking) console.log("Thinking:", parsed.thinking)
      const label = getModelLabel(modelValue)
      const withReply = messagesWithUser.concat({
        id: makeMessageId(),
        role: "assistant",
        content: parsed.actualReply,
        modelLabel: label,
      })
      setMessagesForModel(modelValue, withReply)
    } catch (error: unknown) {
      console.error("chat error:", error)
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMsgs((prev) => ({ ...prev, [modelValue]: detail || "Failed to reach the server." }))
    } finally {
      setLoadingByModel((prev) => ({ ...prev, [modelValue]: false }))
    }
  }

  const generateText = async () => {
    if (!prompt.trim()) return
    if (selectedModels.length === 0) return

    const currentPrompt = prompt
    setPrompt("")
    const userMessage: Message = { id: makeMessageId(), role: "user", content: currentPrompt }

    // Launch all selected panels in parallel
    const promises: Promise<void>[] = []

    for (const modelValue of selectedModels) {
      const existingMessages = messagesByModelRef.current[modelValue] ?? []
      const updatedMessages = existingMessages.concat(userMessage)
      setMessagesForModel(modelValue, updatedMessages)
      promises.push(sendToPanel(modelValue, updatedMessages))
    }

    await Promise.all(promises)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      generateText()
    }
  }

  const handleDeploy = async () => {
    if (!deployModel) return
    setDeployLoading(true)
    setDeployMsg(null)
    try {
      const token = localStorage.getItem("token")
      await axios.post(
        `${backendUrl}/text/deploy`,
        { model_path: deployModel },
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      )
      setDeployMsg("Model deployed successfully! It takes a few seconds for it to appear in model status")
      setDeployModel(null)
    } catch (error: unknown) {
      const errorMsg = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed to deploy model."
      setDeployMsg(errorMsg)
    } finally {
      setDeployLoading(false)
    }
  }

  // Auto-dismiss success message after 4 seconds
  useEffect(() => {
    if (deployMsg === "Model deployed successfully! It takes a few seconds for it to appear in model status") {
      const timer = setTimeout(() => setDeployMsg(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [deployMsg])

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
  const dropdownData = buildDropdownData(modelOptions, modelStatuses)

  // Count models by status
  const statusCounts = Object.values(modelStatuses).reduce(
    (acc, status) => {
      acc[status] = (acc[status] || 0) + 1
      return acc
    },
    {} as Record<ModelStatus, number>
  )

  const statusSummary = [
    statusCounts.live ? `🟢 ${statusCounts.live} ready` : null,
    statusCounts.starting ? `🟡 ${statusCounts.starting} starting` : null,
    statusCounts.paused ? `🔵 ${statusCounts.paused} paused` : null,
    statusCounts.offline ? `⚪ ${statusCounts.offline} offline` : null,
    statusCounts.unknown ? `⚪ ${statusCounts.unknown} unknown` : null,
  ]
    .filter(Boolean)
    .join(" | ")

  const showStartingMsg = Boolean(statusCounts.starting || statusCounts.paused)

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
      {statusSummary && (
        <Alert color="blue" variant="light" mb={8} p="xs" styles={{ message: { fontSize: 13 } }}>
          Model status: {statusSummary}
        </Alert>
      )}
      {showStartingMsg && (
        <Alert color="yellow" variant="light" mb={8} p="xs" styles={{ message: { fontSize: 13 } }}>
          {statusCounts.starting && statusCounts.paused
            ? `${statusCounts.starting} model(s) are still starting up (usually ~2 min). ${statusCounts.paused} model(s) are paused and will cold-start on first use.`
            : statusCounts.starting
              ? "Some of the models are still starting up. It usually takes about 2 minutes."
              : "Some of the models are paused to save costs and will cold-start on first use."}
        </Alert>
      )}

      {/* Deploy model dropdown and button */}
      <Group align="end" gap="sm">
        <Select
          label="Deploy a model"
          placeholder="Select model"
          data={modelOptions}
          value={deployModel}
          onChange={setDeployModel}
          disabled={deployLoading}
          searchable
          clearable
          style={{ minWidth: 220 }}
        />
        <Button
          onClick={handleDeploy}
          disabled={!deployModel || deployLoading}
          loading={deployLoading}
        >
          Deploy
        </Button>
      </Group>

      {deployMsg && (
        <Alert color={deployMsg === "Model deployed successfully! It takes a few seconds for it to appear in model status" ? "green" : "red"} mb={16} withCloseButton onClose={() => setDeployMsg(null)}>
          {deployMsg}
        </Alert>
      )}

      <Text c="dimmed" size="sm" mb={6}>
        Select up to {MAX_MODELS} models for text generation.
      </Text>

      <MultiSelect
        label="Models"
        placeholder={selectedModels.length > 0 ? "" : "Select models"}
        data={dropdownData}
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
                      messages={messagesByModel[modelValue] ?? []}
                      onClearMessages={() => clearMessagesForModel(modelValue)}
                      isLoading={loadingByModel[modelValue] ?? false}
                      isBusy={isAnyLoading}
                      modelStatus={modelStatuses[modelValue] ?? "unknown"}
                      statusMessage={statusMsgs[modelValue] ?? null}
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
                  messages={messagesByModel[modelValue] ?? []}
                  onClearMessages={() => clearMessagesForModel(modelValue)}
                  isLoading={loadingByModel[modelValue] ?? false}
                  isBusy={isAnyLoading}
                  modelStatus={modelStatuses[modelValue] ?? "unknown"}
                  statusMessage={statusMsgs[modelValue] ?? null}
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
            <Button onClick={generateText} disabled={!prompt.trim() || isAnyLoading || selectedModels.some((m) => modelStatuses[m] === "starting")} loading={isAnyLoading}>
              Send
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
