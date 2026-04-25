import { useAuth } from "../context/AuthContext"
import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react"

import {
  Alert,
  Button,
  Group,
  MultiSelect,
  NumberInput,
  Paper,
  Switch,
  Text,
  ScrollArea,
  TextInput,
  Modal,
} from "@mantine/core"

import { useMediaQuery } from "@mantine/hooks"
import ActionStatus from "./ActionStatus"
import { formatDurationMs } from "../utils/time"
import { ShareConversationModal } from "./SharedConversationsModal"
import { fetchTextModels, fetchTextModelStatuses } from "../services/textService"
import { useNavigate } from "react-router-dom"
import { streamText } from "../services/streamService"
import { fetchDashboardContainers } from "../services/dashboardService"

type ModelOption = {
  value: string
  label: string
  supportsThinking: boolean
  modelMode?: "thinking" | "hybrid" | "instruct" | null
}

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  reasoning?: string | null
  modelLabel?: string
  generationTimeMs?: number
  isPending?: boolean
  pendingStartTime?: number
}


type ModelStatus = "live" | "starting" | "offline" | "unknown"

const makeMessageId = () => {
  // Prefer crypto.randomUUID when available; fall back for older browsers.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const MAX_MODELS = 4

const modelStatusPriority: Record<ModelStatus, number> = {
  live: 0,
  starting: 1,
  unknown: 2,
  offline: 3,
}

// Build dropdown data with colored status dots; disable non-live models
function buildDropdownData(modelOptions: ModelOption[], statuses: Record<string, ModelStatus>) {
  return modelOptions
    .map(m => {
      const st = statuses[m.value]
      const isLive = st === "live"
      const emoji = isLive ? "\u{1F7E2}" : st === "starting" ? "\u{1F7E1}" : "\u26AA"

      return {
        value: m.value,
        label: `${emoji} ${m.label}`,
        disabled: !isLive,
      }
    })
    .sort((a, b) => {
      const statusDiff =
        modelStatusPriority[statuses[a.value]] - modelStatusPriority[statuses[b.value]]

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
  thinkingMode?: "thinking" | "hybrid" | "instruct" | null
  enableThinking: boolean
  onToggleThinking: (enabled: boolean) => void
  onShare: () => void
}

function ChatPanel({
  modelLabel,
  messages,
  onClearMessages,
  isLoading,
  isBusy,
  modelStatus,
  statusMessage,
  thinkingMode,
  enableThinking,
  onToggleThinking,
  onShare,
}: ChatPanelProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
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
          color={modelStatus === "starting" ? "yellow" : "gray"}
          variant="light"
          mb={8}
          p="xs"
          styles={{ message: { fontSize: 13 } }}
        >
          {statusMessage
            ? statusMessage
            : modelStatus === "starting"
              ? "This model is starting up. It usually takes about 2 minutes."
              : "This model is not deployed. Ask an admin to deploy it from the dashboard."}
        </Alert>
      )}

      {modelStatus === "live" && statusMessage && (
        <Alert color="green" variant="light" mb={8} p="xs" styles={{ message: { fontSize: 13 } }}>
          {statusMessage}
        </Alert>
      )}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px", alignItems: "center" }}>
        <Button size="xs" color="orange" onClick={onClearMessages} disabled={isBusy}>
          Clear
        </Button>
        {thinkingMode === "thinking" ? (
          <Text size="xs" c="dimmed">
            Thinking only
          </Text>
        ) : thinkingMode === "hybrid" ? (
          <Switch
            label="Thinking"
            size="xs"
            checked={enableThinking}
            onChange={(e) => onToggleThinking(e.currentTarget.checked)}
            disabled={isBusy}
          />
        ) : null}
      </div>
      <Button size="xs" variant="light" onClick={onShare}>
        Share conversation
      </Button>

      <ScrollArea
        style={{
          flex: 1,
          minHeight: isMobile ? "200px" : "300px",
          maxHeight: isMobile ? "55vh" : "65vh",
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
            {messages.map(message => (
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    gap: "8px",
                    marginBottom: "4px",
                  }}
                >
                  <Text fw={700} size="xs">
                    {message.role === "user" ? "You" : (message.modelLabel ?? modelLabel)}
                  </Text>
                  {message.role === "assistant" && message.generationTimeMs != null && (
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                      Response time: {formatDurationMs(message.generationTimeMs)}
                    </Text>
                  )}
                </div>

                {message.isPending ? (
                  <>
                    {message.content ? (
                      
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
                    ) : (
                      message.pendingStartTime ? (
                        <div>
                          <ActionStatus actionText="Generating" startTime={message.pendingStartTime} />
                        </div>
                      ) : null
                    )}
                  </>
                ) : (
                  <>
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

                    {message.role === "assistant" && message.reasoning && (
                      <details style={{ marginTop: "8px" }}>
                        <summary style={{ cursor: "pointer", color: "#666", fontSize: "12px" }}>
                        Show reasoning
                        </summary>
                        <Text
                          size="xs"
                          c="dimmed"
                          mt={6}
                          style={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            overflowWrap: "break-word",
                          }}
                        >
                          {message.reasoning}
                        </Text>
                      </details>
                    )}
                  </>
                )}
              </Paper>
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </ScrollArea>
    </div>
  )
}

// --- Main component ---

export default function TextGenerator({ opened }: { opened: boolean }) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const { isLoggedIn } = useAuth()
  const enableTestModel = import.meta.env.DEV && import.meta.env.VITE_ENABLE_TEST_MODEL !== "false"

  const [prompt, setPrompt] = useState("")
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [messagesByModel, setMessagesByModel] = useState<Record<string, Message[]>>({})
  const [loadingByModel, setLoadingByModel] = useState<Record<string, boolean>>({})
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [maxTokens, setMaxTokens] = useState<number>(256)
  const [enableThinkingByModel, setEnableThinkingByModel] = useState<Record<string, boolean>>({})
  const [deploymentNames, setDeploymentNames] = useState<Record<string, string>>({})
  const [modelPaths, setModelPaths] = useState<Record<string, string>>({})

  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareTargetModel, setShareTargetModel] = useState<string | null>(null)

  const sidebarOpen = opened

  // Keep a ref so async loops always see the latest messages.
  const messagesByModelRef = useRef<Record<string, Message[]>>({})


  const setMessagesForModel = (
    modelValue: string,
    updater: Message[] | ((prev: Message[]) => Message[])
  ) => {
    setMessagesByModel(prev => {
      const previous = prev[modelValue] ?? []
      const next = typeof updater === "function" ? updater(previous) : updater

      messagesByModelRef.current[modelValue] = next

      return {
        ...prev,
        [modelValue]: next,
      }
    })
  }

  const clearMessagesForModel = (modelValue: string) => {
    setMessagesForModel(modelValue, [])
  }

  const [modelStatuses, setModelStatuses] = useState<Record<string, ModelStatus>>({})
  const [joinModalOpen, setJoinModalOpen] = useState(false)
  const [joinId, setJoinId] = useState("")
  const navigate = useNavigate()

  const handleJoin = () => {
    const input = joinId.trim()
    if (!input) return
    const id = input.split("/").pop() ?? input

    setJoinModalOpen(false)
    setJoinId("")
    navigate(`/chat/conversations/${id}`, {
      state: { conversationId: id, modelValue: "", modelLabel: "Assistant" }
    })
  }


  // Fetch available models from backend
  useEffect(() => {
    if (!isLoggedIn) return

    const fetchModels = async () => {
      try {
        // CALL THE REAL API FUNCTION HERE
        const availableModels = await fetchTextModels()

        const models: ModelOption[] = availableModels.map(
          (m: { value: string; label: string; supports_thinking?: boolean; model_mode?: "thinking" | "hybrid" | "instruct" | null }) => ({
            value: m.value,
            label: m.label,
            supportsThinking: m.supports_thinking ?? false,
            modelMode: m.model_mode ?? null,
          })
        )

        if (enableTestModel) {
          models.push({
            value: "test_model",
            label: "test_model",
            supportsThinking: false,
            modelMode: null,
          })
        }

        setModelOptions(models)
      } catch {
        // silent
      }
    }

    fetchModels()
  }, [enableTestModel, isLoggedIn])

  // Poll model statuses (background, for dropdown indicators)
  const fetchStatuses = useCallback(async () => {
    try {
      const statuses = await fetchTextModelStatuses()

      if (enableTestModel) {
        setModelStatuses({ ...statuses, test_model: "live" })
      } else {
        setModelStatuses({ ...statuses })
      }
    } catch {
      // silent
    }
  }, [enableTestModel])

  useEffect(() => {
    if (!isLoggedIn) return
    fetchStatuses()
    const id = setInterval(fetchStatuses, 30000)
    return () => clearInterval(id)
  }, [fetchStatuses, isLoggedIn])

  const getModelLabel = (value: string) => modelOptions.find((m) => m.value === value)?.label ?? value
  const getModelOption = (value: string) => modelOptions.find((m) => m.value === value)
  const getThinkingMode = (value: string) => getModelOption(value)?.modelMode ?? null
  const isThinkingEnabled = (value: string) => {
    const mode = getThinkingMode(value)
    if (mode === "thinking") return true
    if (mode === "instruct") return false
    if (mode === "hybrid") return enableThinkingByModel[value] ?? false
    return false
  }
  const isAnyLoading = selectedModels.some((m) => Boolean(loadingByModel[m]))

  async function loadDeploymentInfo(modelValue: string): Promise<{ deploymentName: string; modelPath: string | undefined }> {
    const existingDeploymentName = deploymentNames[modelValue]
    const existingModelPath = modelPaths[modelValue]
    if (existingDeploymentName) {
      return { deploymentName: existingDeploymentName, modelPath: existingModelPath }
    }

    const containers = await fetchDashboardContainers()
    const container = containers.find(c =>
      c.name.trim().toLowerCase() === modelValue.trim().toLowerCase()
    )
    if (!container) {
      throw new Error(`Model ${modelValue} is not deployed in dashboard`)
    }

    setDeploymentNames(prev => ({ ...prev, [modelValue]: container.name }))
    setModelPaths(prev => ({ ...prev, [modelValue]: container.model_path }))
    return { deploymentName: container.name, modelPath: container.model_path }
  }


  /**
   * Send message to a single model panel.
   * Only works with live/healthy models (dropdown enforces this).
   */
  const sendToPanel = useCallback(async (
    modelValue: string,
    pendingMessageId: string,
    deploymentName: string,
    modelPath?: string,
    userPrompt?: string,
    maxTokens?: number,
  ) => {
    setLoadingByModel(prev => ({ ...prev, [modelValue]: true }))

    try {
      const promptForStream = (userPrompt ?? "").trim()
      if (!promptForStream) {
        throw new Error("Cannot stream empty prompt")
      }

      const stream = streamText(
        promptForStream,
        deploymentName,
        modelPath ?? "",
        maxTokens ?? 256,
        (token: string) => {
          setMessagesForModel(modelValue, prevMessages =>
            prevMessages.map(msg =>
              msg.id === pendingMessageId
                ? { ...msg, content: msg.content + token }
                : msg
            )
          )
        },
        () => {
          setMessagesForModel(modelValue, prevMessages =>
            prevMessages.map(msg =>
              msg.id === pendingMessageId
                ? {
                  ...msg,
                  isPending: false,
                  pendingStartTime: undefined,
                  generationTimeMs: Date.now() - (msg.pendingStartTime ?? Date.now()),
                }
                : msg
            )
          )
        },
        (err: unknown) => {
          console.error("Streaming error:", err)
          setMessagesForModel(modelValue, prevMessages =>
            prevMessages.map(msg =>
              msg.id === pendingMessageId
                ? {
                  ...msg,
                  content: "Failed to stream response.",
                  isPending: false,
                  pendingStartTime: undefined,
                }
                : msg
            )
          )
        }
      )

      await stream.done
    } catch (error) {
      console.error("Streaming failed:", error)
    } finally {
      setLoadingByModel(prev => ({ ...prev, [modelValue]: false }))
    }
  }, [])

  const generateText = async () => {
    if (!prompt.trim()) return
    if (selectedModels.length === 0) return

    const deploymentInfoEntries = await Promise.all(
      selectedModels.map(async (modelValue) => [modelValue, await loadDeploymentInfo(modelValue)] as const)
    )
    const deploymentInfoByModel: Record<string, { deploymentName: string; modelPath: string | undefined }> =
      Object.fromEntries(deploymentInfoEntries)

    const currentPrompt = prompt
    setPrompt("")
    const userMessage: Message = { id: makeMessageId(), role: "user", content: currentPrompt }

    // Launch all selected panels in parallel
    const promises: Promise<void>[] = []

    for (const modelValue of selectedModels) {
      const existingMessages = messagesByModelRef.current[modelValue] ?? []
      const pendingMessageId = makeMessageId()
      const pendingAssistantMessage: Message = {
        id: pendingMessageId,
        role: "assistant",
        content: "",
        modelLabel: getModelLabel(modelValue),
        isPending: true,
        pendingStartTime: Date.now(),
      }
      const updatedMessages = existingMessages.concat(userMessage, pendingAssistantMessage)
      setMessagesForModel(modelValue, updatedMessages)
      const info = deploymentInfoByModel[modelValue]
      promises.push(
        sendToPanel(
          modelValue,
          pendingMessageId,
          info.deploymentName,
          info.modelPath,
          currentPrompt,
          maxTokens,
        )
      )
    }

    await Promise.all(promises)
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
  const dropdownData = buildDropdownData(modelOptions, modelStatuses)


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
        data={dropdownData}
        value={selectedModels}
        maxValues={MAX_MODELS}
        searchable
        clearable
        disabled={isAnyLoading}
        onChange={(models) => {
          setSelectedModels(models)
        }}
      />
      <Button variant="light" onClick={() => setJoinModalOpen(true)}>
        Join conversation
      </Button>

      <Modal
        opened={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        title="Join conversation"
        size="sm"
      >
        <TextInput
          label="Conversation Link"
          placeholder="Paste conversation link here..."
          value={joinId}
          onChange={e => setJoinId(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleJoin() }}
        />
        <Button fullWidth mt="md" onClick={handleJoin} disabled={!joinId.trim()}>
          Join
        </Button>
      </Modal>

      {selectedModels.length > 0 && (
        <Group gap="md">
          <NumberInput
            label="Max Output Tokens"
            value={maxTokens}
            onChange={(val) => {
              const next = typeof val === "number" ? val : 256
              setMaxTokens(next)
            }}
            min={selectedModels.some((m) => isThinkingEnabled(m)) ? 2 : 1}
            max={32768}
            step={64}
            clampBehavior="strict"
            style={{ width: 180 }}
            disabled={isAnyLoading}
          />
        </Group>
      )}

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
                      statusMessage={null}
                      thinkingMode={getThinkingMode(modelValue)}
                      enableThinking={enableThinkingByModel[modelValue] ?? false}
                      onToggleThinking={(enabled) => {
                        setEnableThinkingByModel((prev) => ({ ...prev, [modelValue]: enabled }))
                        if (enabled) {
                          const effectiveMax = Math.max(maxTokens, 2)
                          setMaxTokens(effectiveMax)
                        }
                      }}
                      onShare={() => {
                        setShareTargetModel(modelValue)
                        setShareModalOpen(true)
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // 1-2 models: keep the compact layout.
            <div
              style={{
                display: "grid",
                gap: "20px",
                width: "100%",
                alignItems: "stretch",

                gridTemplateColumns: isMobile
                  ? "1fr"
                  : sidebarOpen && selectedModels.length >= 3
                    ? "repeat(2, 1fr)"
                    : "repeat(auto-fit, minmax(280px, 1fr))",

                transition: "padding-right 0.3s ease",
                paddingRight: sidebarOpen ? "260px" : "0px",
              }}
            >
              {selectedModels.map(modelValue => (
                <ChatPanel
                  key={modelValue}
                  modelValue={modelValue}
                  modelLabel={getModelLabel(modelValue)}
                  messages={messagesByModel[modelValue] ?? []}
                  onClearMessages={() => clearMessagesForModel(modelValue)}
                  isLoading={loadingByModel[modelValue] ?? false}
                  isBusy={isAnyLoading}
                  modelStatus={modelStatuses[modelValue] ?? "unknown"}
                  statusMessage={null}
                  thinkingMode={getThinkingMode(modelValue)}
                  enableThinking={enableThinkingByModel[modelValue] ?? false}
                  onToggleThinking={(enabled) => {
                    setEnableThinkingByModel(prev => ({ ...prev, [modelValue]: enabled }))
                    if (enabled) {
                      const effectiveMax = Math.max(maxTokens, 2)
                      setMaxTokens(effectiveMax)
                    }
                  }}
                  onShare={() => {
                    setShareTargetModel(modelValue)
                    setShareModalOpen(true)
                  }}
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
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isAnyLoading}
            />
            <Button
              onClick={generateText}
              disabled={!prompt.trim() || isAnyLoading}
              loading={isAnyLoading}
            >
              Send
            </Button>
          </div>
        </>
      )
      }
      <ShareConversationModal
        opened={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        currentMessages={shareTargetModel ? (messagesByModel[shareTargetModel] ?? []) : []}
        modelValue={shareTargetModel ?? ""}
      />
    </div>

  )
}