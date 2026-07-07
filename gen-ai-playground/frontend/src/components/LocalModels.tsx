import { useAuth } from "../context/AuthContext"
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import {
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  Loader,
  NumberInput,
  Paper,
  Progress,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core"
import { notifications } from "@mantine/notifications"
import { useMediaQuery } from "@mantine/hooks"
import { ollamaBaseUrl } from "../utils/env"
import {
  chatLocalStream,
  listLocalModels,
  pingOllama,
  pullModel,
  warmupModel,
  type ChatMessage,
  type ChatStreamHandle,
  type LocalModel,
} from "../services/localModelsService"
import { LOCAL_MODEL_CATALOG } from "../constants/localModels"

type Detection = "checking" | "online" | "offline"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  isPending?: boolean
  /** A failed assistant turn (error text) — shown to the user but never sent back as history. */
  isError?: boolean
}

const makeId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// --- Setup / onboarding panel shown when no local Ollama answers ---

function SetupStep({ children }: { children: React.ReactNode }) {
  return <Text size="sm" mb={4}>{children}</Text>
}

function CommandLine({ command }: { command: string }) {
  return (
    <Group gap="xs" wrap="nowrap" mb={8} align="center">
      <Code style={{ flex: 1, overflowX: "auto", whiteSpace: "nowrap" }}>{command}</Code>
      <CopyButton value={command}>
        {({ copied, copy }) => (
          <Button size="xs" variant="light" color={copied ? "green" : "blue"} onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </CopyButton>
    </Group>
  )
}

type OsKey = "macos" | "windows" | "linux"

type SetupStepData = { label: string; command?: string; note?: React.ReactNode }

// Per-OS setup instructions. Only the wording/commands differ — the app itself is
// identical across platforms (it just talks to http://localhost:11434).
const OS_SETUP: Record<OsKey, { label: string; steps: SetupStepData[] }> = {
  macos: {
    label: "macOS",
    steps: [
      { label: "Install Ollama (Homebrew or ollama.com):", command: "brew install ollama" },
      { label: "Start the Ollama service (or open the Ollama app):", command: "ollama serve" },
      {
        label: "Allow the browser to reach Ollama (CORS), then restart Ollama:",
        command: 'launchctl setenv OLLAMA_ORIGINS "*"',
        note: (
          <>
            Without <Code>OLLAMA_ORIGINS</Code>, the browser blocks requests from this page's
            origin. Use <Code>"*"</Code> for local development.
          </>
        ),
      },
      { label: "Download a model (or use “Download” below once connected):", command: "ollama pull llama3.2:3b" },
    ],
  },
  windows: {
    label: "Windows",
    steps: [
      {
        label: "Install Ollama (winget, or download the installer from ollama.com/download):",
        command: "winget install Ollama.Ollama",
      },
      { label: "Ollama then runs automatically as a background service on port 11434." },
      {
        label: "Allow the browser to reach Ollama (CORS), then restart Ollama from the tray:",
        command: 'setx OLLAMA_ORIGINS "*"',
        note: (
          <>
            Open a new terminal / restart Ollama after <Code>setx</Code> so the variable takes
            effect.
          </>
        ),
      },
      { label: "Download a model (or use “Download” below once connected):", command: "ollama pull llama3.2:3b" },
    ],
  },
  linux: {
    label: "Linux / WSL",
    steps: [
      { label: "Install Ollama:", command: "curl -fsSL https://ollama.com/install.sh | sh" },
      {
        label: "Start it, binding to all interfaces (important for WSL) and allowing CORS:",
        command: "OLLAMA_HOST=0.0.0.0:11434 OLLAMA_ORIGINS=* ollama serve",
      },
      {
        label: "Download a model (or use “Download” below once connected):",
        command: "ollama pull llama3.2:3b",
        note: (
          <>
            On WSL, <Code>localhost:11434</Code> usually reaches Ollama from the Windows browser via
            port forwarding. If not, set <Code>VITE_OLLAMA_URL</Code> to the WSL IP
            (<Code>hostname -I</Code>).
          </>
        ),
      },
    ],
  },
}

/** Best-effort detection of the current OS so the right tab is pre-selected. */
function detectOs(): OsKey {
  const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "").toLowerCase()
  if (ua.includes("windows")) return "windows"
  if (ua.includes("mac")) return "macos"
  if (ua.includes("linux") || ua.includes("x11")) return "linux"
  return "macos"
}

function OnboardingPanel({ checking, onRetry }: { checking: boolean; onRetry: () => void }) {
  const [os, setOs] = useState<OsKey>(detectOs)
  const setup = OS_SETUP[os]

  return (
    <Paper p="lg" style={{ border: "1px solid #ddd", borderRadius: 8, maxWidth: 720 }}>
      <Title order={4} mb={6}>Run a model on your own machine</Title>
      <Text c="dimmed" size="sm" mb="md">
        This page talks directly to a local Ollama instance at <Code>{ollamaBaseUrl}</Code>.
        We couldn't reach it. Follow these steps for your system, then check again.
      </Text>

      <Tabs value={os} onChange={value => value && setOs(value as OsKey)} mb="md">
        <Tabs.List>
          {(Object.keys(OS_SETUP) as OsKey[]).map(key => (
            <Tabs.Tab key={key} value={key}>{OS_SETUP[key].label}</Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      {setup.steps.map((step, index) => (
        <div key={index}>
          <SetupStep><b>{index + 1}.</b> {step.label}</SetupStep>
          {step.command && <CommandLine command={step.command} />}
          {step.note && <Text size="xs" c="dimmed" mb="md">{step.note}</Text>}
        </div>
      ))}

      <Group mt="md">
        <Button onClick={onRetry} loading={checking}>Check again</Button>
      </Group>
    </Paper>
  )
}

// --- Main component ---

export default function LocalModels() {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const { isLoggedIn } = useAuth()

  const [detection, setDetection] = useState<Detection>("checking")
  const [installed, setInstalled] = useState<LocalModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState("")
  const [temperature, setTemperature] = useState<number>(0.7)
  const [maxTokens, setMaxTokens] = useState<number>(512)
  const [isStreaming, setIsStreaming] = useState(false)
  const [pullingByName, setPullingByName] = useState<Record<string, number | "indeterminate">>({})

  const streamHandleRef = useRef<ChatStreamHandle | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<Message[]>([])

  const setMessagesTracked = useCallback(
    (updater: Message[] | ((prev: Message[]) => Message[])) => {
      setMessages(prev => {
        const next = typeof updater === "function" ? updater(prev) : updater
        messagesRef.current = next
        return next
      })
    },
    [],
  )

  // Detect Ollama + load installed models.
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setDetection("checking")
    const online = await pingOllama(signal)
    if (signal?.aborted) return
    if (!online) {
      setDetection("offline")
      setInstalled([])
      return
    }
    setDetection("online")
    try {
      const models = await listLocalModels(signal)
      if (signal?.aborted) return
      setInstalled(models)
      setSelectedModel(prev => prev ?? models[0]?.name ?? null)
    } catch {
      // Reachable but listing failed — leave detection online, models empty.
      setInstalled([])
    }
  }, [])

  useEffect(() => {
    if (!isLoggedIn) return
    const controller = new AbortController()
    refresh(controller.signal)
    return () => controller.abort()
  }, [isLoggedIn, refresh])

  // Cancel an in-flight stream if the user navigates away.
  useEffect(() => {
    return () => {
      streamHandleRef.current?.cancel()
      streamHandleRef.current = null
    }
  }, [])

  // Auto-scroll to the newest message, but only when the user is already near the
  // bottom — otherwise streaming tokens would keep yanking them down while they
  // try to read earlier messages.
  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport) {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      if (distanceFromBottom > 80) return
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isStreaming])

  const installedNames = useMemo(() => new Set(installed.map(m => m.name)), [installed])

  const selectData = useMemo(
    () => installed.map(m => ({
      value: m.name,
      label: m.parameterSize ? `${m.name} (${m.parameterSize})` : m.name,
    })),
    [installed],
  )

  // Models from the catalog that are not yet installed — offered for download.
  const downloadable = useMemo(
    () => LOCAL_MODEL_CATALOG.filter(m => !installedNames.has(m.name)),
    [installedNames],
  )

  const handlePull = useCallback(async (name: string, label: string) => {
    if (pullingByName[name] != null) return
    setPullingByName(prev => ({ ...prev, [name]: "indeterminate" }))
    try {
      await pullModel(name, progress => {
        setPullingByName(prev => ({
          ...prev,
          [name]: progress.fraction != null ? Math.round(progress.fraction * 100) : "indeterminate",
        }))
      })
      notifications.show({ title: "Model ready", message: `${label} downloaded.`, color: "green" })
      await refresh()
      // Don't hijack the selection (and the streaming bubble's label) if a chat is
      // mid-stream — the user can pick the freshly downloaded model themselves.
      if (!streamHandleRef.current) setSelectedModel(name)
      // Warm the model into memory so the first chat is fast; failures here are non-fatal.
      warmupModel(name).catch(() => {})
    } catch (err) {
      const message = err instanceof Error ? err.message : "Download failed"
      notifications.show({ title: "Download failed", message, color: "red" })
    } finally {
      setPullingByName(prev => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }, [pullingByName, refresh])

  const sendMessage = useCallback(() => {
    const text = prompt.trim()
    if (!text || !selectedModel || isStreaming) return

    const userMessage: Message = { id: makeId(), role: "user", content: text }
    const pendingId = makeId()
    const pending: Message = { id: pendingId, role: "assistant", content: "", isPending: true }

    const history: ChatMessage[] = messagesRef.current
      .filter(m => !m.isPending && !m.isError)
      .map(m => ({ role: m.role, content: m.content }))
      .concat({ role: "user", content: text })

    setMessagesTracked(prev => prev.concat(userMessage, pending))
    setPrompt("")
    setIsStreaming(true)

    const handle = chatLocalStream(
      selectedModel,
      history,
      { temperature, maxTokens },
      token => {
        setMessagesTracked(prev =>
          prev.map(m => (m.id === pendingId ? { ...m, content: m.content + token } : m)),
        )
      },
      () => {
        setMessagesTracked(prev =>
          prev.map(m => (m.id === pendingId ? { ...m, isPending: false } : m)),
        )
        setIsStreaming(false)
        streamHandleRef.current = null
      },
      err => {
        const message = err instanceof Error ? err.message : "Failed to get a response."
        setMessagesTracked(prev =>
          prev.map(m => (m.id === pendingId ? { ...m, content: message, isPending: false, isError: true } : m)),
        )
        setIsStreaming(false)
        streamHandleRef.current = null
      },
    )
    streamHandleRef.current = handle
  }, [prompt, selectedModel, isStreaming, temperature, maxTokens, setMessagesTracked])

  const stop = useCallback(() => {
    streamHandleRef.current?.cancel()
    streamHandleRef.current = null
    setMessagesTracked(prev => prev.map(m => (m.isPending ? { ...m, isPending: false } : m)))
    setIsStreaming(false)
  }, [setMessagesTracked])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!isLoggedIn) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
        <p>You must be logged in to use local models.</p>
      </div>
    )
  }

  if (detection === "checking" && installed.length === 0) {
    return (
      <Group justify="center" p="xl">
        <Loader size="sm" />
        <Text c="dimmed">Looking for a local Ollama…</Text>
      </Group>
    )
  }

  if (detection === "offline") {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
        <OnboardingPanel checking={false} onRetry={() => refresh()} />
      </div>
    )
  }

  const isBusy = isStreaming

  return (
    <Stack gap="md" style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <Badge color="green" variant="light">Ollama connected</Badge>
          <Text size="xs" c="dimmed">{ollamaBaseUrl}</Text>
        </Group>
        <Button size="xs" variant="subtle" onClick={() => refresh()}>Refresh</Button>
      </Group>

      {installed.length === 0 ? (
        <Alert color="yellow" variant="light">
          No models installed yet. Download one below to get started.
        </Alert>
      ) : (
        <Select
          label="Local model"
          placeholder="Select a model"
          data={selectData}
          value={selectedModel}
          onChange={setSelectedModel}
          searchable
          disabled={isBusy}
          style={{ maxWidth: 420 }}
        />
      )}

      {downloadable.length > 0 && (
        <Paper p="md" style={{ border: "1px solid #eee", borderRadius: 8 }}>
          <Text fw={600} size="sm" mb={8}>Download a model from the app</Text>
          <Stack gap={8}>
            {downloadable.map(m => {
              const progress = pullingByName[m.name]
              const isPulling = progress != null
              return (
                <Group key={m.name} justify="space-between" wrap="nowrap" align="center">
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={500}>{m.label} <Text span c="dimmed" size="xs">· {m.size}</Text></Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>{m.description}</Text>
                    {isPulling && (
                      <Progress
                        mt={4}
                        value={progress === "indeterminate" ? 100 : progress}
                        animated={progress === "indeterminate"}
                        size="sm"
                      />
                    )}
                  </div>
                  <Button
                    size="xs"
                    variant="light"
                    color="green"
                    loading={isPulling}
                    onClick={() => handlePull(m.name, m.label)}
                  >
                    Download
                  </Button>
                </Group>
              )
            })}
          </Stack>
        </Paper>
      )}

      {installed.length > 0 && (
        <>
          <Group gap="md">
            <NumberInput
              label="Temperature"
              value={temperature}
              onChange={val => setTemperature(typeof val === "number" ? val : 0.7)}
              min={0}
              max={2}
              step={0.1}
              decimalScale={1}
              style={{ width: 140 }}
              disabled={isBusy}
            />
            <NumberInput
              label="Max output tokens"
              value={maxTokens}
              onChange={val => setMaxTokens(typeof val === "number" ? val : 512)}
              min={1}
              max={8192}
              step={64}
              clampBehavior="strict"
              style={{ width: 180 }}
              disabled={isBusy}
            />
          </Group>

          <Group gap="xs">
            <Button size="xs" color="orange" onClick={() => setMessagesTracked([])} disabled={isBusy}>
              Clear
            </Button>
            {isStreaming && (
              <Button size="xs" color="red" onClick={stop}>Stop</Button>
            )}
          </Group>

          <ScrollArea
            viewportRef={viewportRef}
            style={{
              minHeight: isMobile ? 200 : 300,
              maxHeight: isMobile ? "50vh" : "60vh",
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 12,
            }}
          >
            {messages.length === 0 ? (
              <Text c="dimmed" ta="center" size="sm">No messages yet.</Text>
            ) : (
              messages.map(message => (
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
                    {message.role === "user" ? "You" : (selectedModel ?? "Assistant")}
                  </Text>
                  {message.isPending && !message.content ? (
                    <Group gap="xs">
                      <Loader size="xs" />
                      <Text size="sm" c="dimmed">Generating…</Text>
                    </Group>
                  ) : (
                    <Text
                      size="sm"
                      style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word" }}
                    >
                      {message.content}
                    </Text>
                  )}
                </Paper>
              ))
            )}
            <div ref={bottomRef} />
          </ScrollArea>

          <Group gap="xs" wrap="nowrap">
            <TextInput
              style={{ flex: 1, minWidth: 0 }}
              placeholder="Type your message…"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isBusy || !selectedModel}
            />
            <Button
              className="btn-primary app-transcribe-btn"
              onClick={sendMessage}
              disabled={!prompt.trim() || isBusy || !selectedModel}
              loading={isBusy}
            >
              Send
            </Button>
          </Group>
        </>
      )}
    </Stack>
  )
}
