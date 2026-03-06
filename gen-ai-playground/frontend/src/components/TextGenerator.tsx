import axios from "axios"
import { useAuth } from "../context/AuthContext"
import { useState, useEffect, useRef } from "react"

import {
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
    role: "user" | "assistant" | "system"
    content: string
}

type Deployment = {
    name: string
}

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

// --- Chat panel (display only) ---

type ChatPanelProps = {
    panelId: 1 | 2
    backendUrl: string
    getAuthHeaders: () => Record<string, string>
    selectedModel: string | null
    onModelChange: (model: string | null) => void
    messages: Message[]
    onClearMessages: () => void
    isLoading: boolean
}

function ChatPanel({
    panelId,
    backendUrl,
    getAuthHeaders,
    selectedModel,
    onModelChange,
    messages,
    onClearMessages,
    isLoading
}: ChatPanelProps) {
    const bottomRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages, isLoading])

    const findSelectedModel = () =>
        modelOptions.find((m) => m.value === selectedModel) ?? null

    const deployContainer = async () => {
        if (!selectedModel) return
        const selected = findSelectedModel()
        if (!selected) return

        try {
            const deploymentsResponse = await axios.get(
                `${backendUrl}/text/deployments`,
                {
                    headers: getAuthHeaders(),
                    withCredentials: true
                }
            )
            const deployments = deploymentsResponse.data || []

            console.log(deployments)

            const existingContainer = deployments.find((d: Deployment) => {
                const name = typeof d?.name === "string" ? d.name.toLowerCase() : ""
                return name.includes(selected.slug.toLowerCase())
            })

            if (existingContainer) {
                console.log("Found existing container for model:", existingContainer.name)

                const connectResponse = await axios.post(
                    `${backendUrl}/text/connect`,
                    { deployment_name: existingContainer.name, model_path: selectedModel },
                    { headers: getAuthHeaders(), withCredentials: true }
                )
                console.log(`Panel ${panelId}: Connected to existing container:`, connectResponse.data)
                return connectResponse.data
            }

            console.log("No deployment found for model, creating new one...")

            const response = await axios.post(
                `${backendUrl}/text/deploy`,
                { model_path: selectedModel },
                { headers: getAuthHeaders(), withCredentials: true }
            )
            console.log(`Panel ${panelId}: Created new deployment:`, response.data)
            return response.data
        } catch (error) {
            console.error(`Panel ${panelId} deploy error:`, error)
        }
    }

    const deleteContainer = async () => {
        try {
            const response = await axios.delete(`${backendUrl}/text/deploy`, {
                headers: getAuthHeaders(),
                withCredentials: true
            })
            console.log(`Panel ${panelId} delete:`, response.data)
        } catch (error) {
            console.error(`Panel ${panelId} delete error:`, error)
        }
    }

    const checkContainerStatus = async () => {
        try {
            const response = await axios.get(`${backendUrl}/text/status`, {
                headers: getAuthHeaders(),
                withCredentials: true
            })
            console.log(`Panel ${panelId} status:`, response.data)
        } catch (error) {
            console.error(`Panel ${panelId} status error:`, error)
        }
    }

    return (
        <div style={{ flex: "1 1 calc(50% - 10px)", minWidth: "320px", maxWidth: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
            <Text fw={700} mb={8}>Model {panelId}</Text>

            <MultiSelect
                label="Select model"
                placeholder="Select model"
                data={modelOptions}
                maxValues={1}
                value={selectedModel ? [selectedModel] : []}
                onChange={(value) => onModelChange(value[0] ?? null)}
                mb={8}
            />

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                <Button size="xs" onClick={deployContainer} disabled={!selectedModel}>
                    Deploy
                </Button>
                <Button size="xs" onClick={checkContainerStatus}>
                    Status
                </Button>
                <Button size="xs" color="red" onClick={deleteContainer}>
                    Delete
                </Button>
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
                    messages.map((message, index) => (
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
                                {message.role === "user" ? "You" : selectedModel ?? "Assistant"}
                            </Text>
                            <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word" }}>
                                {message.content}
                            </Text>
                        </Paper>
                    ))
                )}
                {isLoading && (
                    <Text c="dimmed" size="sm" ta="center">Generating...</Text>
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

    const getCsrfToken = (): string => {
        const value = `; ${document.cookie}`
        const parts = value.split(`; csrf_token=`)
        if (parts.length === 2) return parts.pop()!.split(";").shift()!
        return ""
    }

    const getAuthHeaders = () => {
        return { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() }
    }

    const connectToModel = async (modelValue: string): Promise<boolean> => {
        const selected = modelOptions.find((m) => m.value === modelValue)
        if (!selected) return false

        try {
            const deploymentsResponse = await axios.get(
                `${backendUrl}/text/deployments`,
                {
                    headers: getAuthHeaders(),
                    withCredentials: true
                }
            )
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
                { headers: getAuthHeaders(), withCredentials: true }
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
                    top_p: 0.9
                },
                { headers: getAuthHeaders(), withCredentials: true }
            )
            const parsed = parseModelReply(response.data.reply)
            if (parsed.thinking) {
                console.log("Model thinking:", parsed.thinking)
            }
            return parsed.actualReply
        } catch (error) {
            console.error("Error during chat:", error)
            return null
        }
    }

    const generateText = async () => {
        if (!prompt.trim()) return

        const currentPrompt = prompt
        setPrompt("")

        const userMessage: Message = { role: "user", content: currentPrompt }

        // --- Model 1 ---
        if (selectedModel1) {
            const updatedMessages1 = [...messages1, userMessage]
            setMessages1(updatedMessages1)
            setIsLoading1(true)

            const connected = await connectToModel(selectedModel1)
            if (connected) {
                const reply = await chatWithCurrentModel(updatedMessages1)
                if (reply) {
                    setMessages1([...updatedMessages1, { role: "assistant", content: reply }])
                }
            }

            setIsLoading1(false)
        }

        // --- Model 2 ---
        if (selectedModel2) {
            const updatedMessages2 = [...messages2, userMessage]
            setMessages2(updatedMessages2)
            setIsLoading2(true)

            const connected = await connectToModel(selectedModel2)
            if (connected) {
                const reply = await chatWithCurrentModel(updatedMessages2)
                if (reply) {
                    setMessages2([...updatedMessages2, { role: "assistant", content: reply }])
                }
            }

            setIsLoading2(false)
        }
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
                    backendUrl={backendUrl}
                    getAuthHeaders={getAuthHeaders}
                    selectedModel={selectedModel1}
                    onModelChange={setSelectedModel1}
                    messages={messages1}
                    onClearMessages={() => setMessages1([])}
                    isLoading={isLoading1}
                />
                <ChatPanel
                    panelId={2}
                    backendUrl={backendUrl}
                    getAuthHeaders={getAuthHeaders}
                    selectedModel={selectedModel2}
                    onModelChange={setSelectedModel2}
                    messages={messages2}
                    onClearMessages={() => setMessages2([])}
                    isLoading={isLoading2}
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