import axios from "axios"
import { useAuth } from "../context/AuthContext"
import { useState, useEffect, useRef, useCallback } from "react"

import {
    Alert,
    Button,
    MultiSelect,
    Paper,
    Text,
    ScrollArea,
    TextInput
} from '@mantine/core'

type ModelOption = {
    value: string
    label: string
    slug: string
}

type Message = {
    role: "user" | "assistant"
    content: string
    modelLabel?: string
}

type ModelStatus = "live" | "starting" | "offline" | "unknown"

const modelOptions: ModelOption[] = [
    {
        value: "deepseek-llm-7b",
        label: "DeepSeek LLM 7B",
        slug: "deepseek-llm-7b-chat"
    },
    {
        value: "Qwen3-8B",
        label: "Qwen 3 8B",
        slug: "qwen3-8b"
    },
    {
        value: "Qwen3-32B",
        label: "Qwen 3 32B",
        slug: "qwen3-32b"
    },
    {
        value: "Llama-3.1-8B",
        label: "Llama 3.1 8B",
        slug: "llama-3.1-8b-instruct"
    }
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

// Build dropdown data with colored status dots; disable non-live models
function buildDropdownData(statuses: Record<string, ModelStatus>) {
    return modelOptions.map(m => {
        const st = statuses[m.value]
        const isLive = st === "live"
        const emoji = isLive ? "\u{1F7E2}" : st === "starting" ? "\u{1F7E1}" : "\u26AA"
        return {
            value: m.value,
            label: `${emoji} ${m.label}`,
            disabled: !isLive,
        }
    })
}

// --- Chat panel (display only) ---

type ChatPanelProps = {
    panelId: 1 | 2
    selectedModel: string | null
    onModelChange: (model: string | null) => void
    messages: Message[]
    onClearMessages: () => void
    isLoading: boolean
    modelStatuses: Record<string, ModelStatus>
    statusMessage: string | null
}

function ChatPanel({
    panelId,
    selectedModel,
    onModelChange,
    messages,
    onClearMessages,
    isLoading,
    modelStatuses,
    statusMessage,
}: ChatPanelProps) {
    const bottomRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages, isLoading])

    const dropdownData = buildDropdownData(modelStatuses)

    const selectedStatus = selectedModel ? (modelStatuses[selectedModel] ?? "unknown") : null

    return (
        <div style={{ flex: "1 1 calc(50% - 10px)", minWidth: "320px", maxWidth: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
            <Text fw={700} mb={8}>Model {panelId}</Text>

            <MultiSelect
                label="Select model"
                placeholder="Select model"
                data={dropdownData}
                maxValues={1}
                value={selectedModel ? [selectedModel] : []}
                onChange={(value) => onModelChange(value[0] ?? null)}
                mb={4}
            />

            {selectedModel && selectedStatus && selectedStatus !== "live" && (
                <Alert
                    color={selectedStatus === "starting" ? "yellow" : "gray"}
                    variant="light"
                    mb={8}
                    p="xs"
                    styles={{ message: { fontSize: 13 } }}
                >
                    {statusMessage
                        ? statusMessage
                        : selectedStatus === "starting"
                            ? "This model is starting up. It usually takes about 2 minutes."
                            : "This model is not deployed. Ask an admin to deploy it from the dashboard."}
                </Alert>
            )}

            {selectedModel && selectedStatus === "live" && statusMessage && (
                <Alert color="green" variant="light" mb={8} p="xs" styles={{ message: { fontSize: 13 } }}>
                    {statusMessage}
                </Alert>
            )}

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                <Button size="xs" color="orange" onClick={onClearMessages}>
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
                    <Text c="dimmed" ta="center" size="sm">No messages yet.</Text>
                ) : (
                    <>
                        {messages.map((message, index) => (
                            <Paper
                                key={index}
                                p="sm"
                                mb="xs"
                                style={{
                                    backgroundColor: message.role === "user" ? "#e3f2fd" : "#f5f5f5",
                                    marginLeft: message.role === "user" ? "15%" : "0",
                                    marginRight: message.role === "user" ? "0" : "15%",
                                }}
                            >
                                <Text fw={700} size="xs" mb={4}>
                                    {message.role === "user" ? "You" : message.modelLabel ?? selectedModel ?? "Assistant"}
                                </Text>
                                <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word" }}>
                                    {message.content}
                                </Text>
                            </Paper>
                        ))}
                        {isLoading && (
                            <Text c="dimmed" size="sm" ta="center">Generating...</Text>
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

    const [selectedModel1, setSelectedModel1] = useState<string | null>(null)
    const [selectedModel2, setSelectedModel2] = useState<string | null>(null)

    const [messages1, setMessages1] = useState<Message[]>([])
    const [messages2, setMessages2] = useState<Message[]>([])

    const [isLoading1, setIsLoading1] = useState(false)
    const [isLoading2, setIsLoading2] = useState(false)

    const [modelStatuses, setModelStatuses] = useState<Record<string, ModelStatus>>({})
    const [statusMsg1, setStatusMsg1] = useState<string | null>(null)
    const [statusMsg2, setStatusMsg2] = useState<string | null>(null)

    const getAuthHeaders = () => {
        const token = localStorage.getItem("token")
        if (!token) throw new Error("Token puuttuu")
        return {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        }
    }

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
        const id = setInterval(fetchStatuses, 30000)
        return () => clearInterval(id)
    }, [fetchStatuses, isLoggedIn])

    // Clear status messages when user switches model
    useEffect(() => { setStatusMsg1(null) }, [selectedModel1])
    useEffect(() => { setStatusMsg2(null) }, [selectedModel2])

    /**
     * Send message to a single panel.
     * Only works with live/healthy models (dropdown enforces this).
     */
    const sendToPanel = async (
        modelValue: string,
        messagesWithUser: Message[],
        setMessages: (msgs: Message[] | ((prev: Message[]) => Message[])) => void,
        setIsLoading: (v: boolean) => void,
        setStatusMsg: (msg: string | null) => void,
    ) => {
        setIsLoading(true)

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
            const label = modelOptions.find(m => m.value === modelValue)?.label ?? modelValue
            setMessages([...messagesWithUser, { role: "assistant", content: parsed.actualReply, modelLabel: label }])
        } catch (error: any) {
            console.error("chat error:", error)
            const detail = error?.response?.data?.detail
            setStatusMsg(detail || "Failed to reach the server.")
        } finally {
            setIsLoading(false)
        }
    }

    const generateText = async () => {
        if (!prompt.trim()) return

        const currentPrompt = prompt
        setPrompt("")

        const userMessage: Message = { role: "user", content: currentPrompt }

        // Launch both panels in parallel
        const promises: Promise<void>[] = []

        if (selectedModel1) {
            const updatedMessages1 = [...messages1, userMessage]
            setMessages1(updatedMessages1)
            promises.push(
                sendToPanel(
                    selectedModel1, updatedMessages1,
                    setMessages1, setIsLoading1, setStatusMsg1,
                )
            )
        }

        if (selectedModel2) {
            const updatedMessages2 = [...messages2, userMessage]
            setMessages2(updatedMessages2)
            promises.push(
                sendToPanel(
                    selectedModel2, updatedMessages2,
                    setMessages2, setIsLoading2, setStatusMsg2,
                )
            )
        }

        await Promise.all(promises)
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            generateText()
        }
    }

    if (!isLoggedIn) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", textAlign: "center", padding: 40 }}>
                <p>You must be logged in to generate text.</p>
            </div>
        )
    }

    const isLoading = isLoading1 || isLoading2

    return (
        <div style={{ display: "flex", flexDirection: "column", maxWidth: "1000px", margin: "0 auto", padding: "20px", boxSizing: "border-box", overflowX: "hidden" }}>

            <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "20px",
                marginBottom: "16px",
                alignItems: "stretch",
            }}>
                <ChatPanel
                    panelId={1}
                    selectedModel={selectedModel1}
                    onModelChange={setSelectedModel1}
                    messages={messages1}
                    onClearMessages={() => setMessages1([])}
                    isLoading={isLoading1}
                    modelStatuses={modelStatuses}
                    statusMessage={statusMsg1}
                />
                <ChatPanel
                    panelId={2}
                    selectedModel={selectedModel2}
                    onModelChange={setSelectedModel2}
                    messages={messages2}
                    onClearMessages={() => setMessages2([])}
                    isLoading={isLoading2}
                    modelStatuses={modelStatuses}
                    statusMessage={statusMsg2}
                />
            </div>

            {/* Shared input */}
            <div style={{ display: "flex", gap: "10px" }}>
                <TextInput
                    style={{ flex: 1, minWidth: 0 }}
                    placeholder="Type your message to send to both models..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isLoading}
                />
                <Button
                    onClick={generateText}
                    disabled={!prompt.trim() || isLoading}
                    loading={isLoading}
                >
                    Send to Both
                </Button>
            </div>
        </div>
    )
}