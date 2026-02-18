import axios from "axios"
import { useAuth } from "../context/AuthContext"
import { useState } from "react"

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
        value: "Llama-3.1-8B",
        label: "Llama 3.1 8B",
        slug: "llama-3.1-8b-instruct"
    }
]

function parseModelReply(rawReply: string): {
    thinking: string | null;
    actualReply: string;
} {
    const thinkingMatch = rawReply.match(/<think>([\s\S]*?)<\/think>/);

    if (thinkingMatch) {
        const thinking = thinkingMatch[1].trim();
        const actualReply = rawReply.replace(/<think>[\s\S]*?<\/think>/, '').trim();

        return {
            thinking,
            actualReply
        };
    }

    return {
        thinking: null,
        actualReply: rawReply.trim()
    };
}

export default function TextGenerator() {
    const { isLoggedIn } = useAuth()
    const backendUrl = import.meta.env.VITE_API_URL
    const [selectedModel, setSelectedModel] = useState<string | null>(null)
    const [prompt, setPrompt] = useState("")
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)

    const getAuthHeaders = () => {
        const token = localStorage.getItem("token")
        if (!token) {
            throw new Error("Token puuttuu")
        }

        return {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        }
    }

    const findSelectedModel = () =>
        modelOptions.find((model) => model.value === selectedModel) ?? null

    const DeployContainer = async () => {
        if (!selectedModel) {
            console.warn("Model not selected")
            return
        }

        const selected = findSelectedModel()
        if (!selected) {
            console.warn("Selected model definition missing")
            return
        }

        console.log("Deploying container with model:", selectedModel)

        try {
            const deploymentsResponse = await axios.get(
                `${backendUrl}/text/deployments`,
                {
                    headers: getAuthHeaders()
                }
            )

            const deployments = deploymentsResponse.data || []
            console.log("Existing deployments:", deployments)

            const existingContainer = deployments.find(
                (d: Deployment) => {
                    const name = typeof d?.name === "string" ? d.name.toLowerCase() : ""
                    return name.includes(selected.slug.toLowerCase())
                }
            )

            if (existingContainer) {
                console.log("Found existing container for model:", existingContainer.name)

                const connectResponse = await axios.post(
                    `${backendUrl}/text/connect`,
                    {
                        deployment_name: existingContainer.name,
                        model_path: selectedModel
                    },
                    {
                        headers: getAuthHeaders()
                    }
                )

                console.log("Connected to existing container:", connectResponse.data)
                return connectResponse.data
            }

            console.log("No deployment found for model, creating new one...")

            const response = await axios.post(
                `${backendUrl}/text/deploy`,
                {
                    model_path: selectedModel
                },
                {
                    headers: getAuthHeaders()
                }
            )

            console.log("Created new deployment:", response.data)
            return response.data
        } catch (error) {
            console.error("Virhe:", error)
        }
    }

    const DeleteContainer = async () => {
        try {
            const response = await axios.delete(`${backendUrl}/text/deploy`, {
                headers: getAuthHeaders()
            });
            console.log(response.data);
            return response.data;
        } catch (error) {
            console.error("Virhe:", error);
        }
    }

    const CheckContainerStatus = async () => {
        try {
            const response = await axios.get(`${backendUrl}/text/status`, {
                headers: getAuthHeaders()
            });
            console.log(response.data);
            return response.data;
        } catch (error) {
            console.error("Virhe:", error);
        }
    }

    const GenerateText = async () => {
        if (!prompt.trim()) {
            console.warn("Prompt is empty")
            return
        }

        if (!selectedModel) {
            console.warn("Model not selected")
            return
        }

        const selected = findSelectedModel()
        if (!selected) {
            console.warn("Selected model definition missing")
            return
        }

        setIsLoading(true)

        // Add user message to conversation
        const userMessage: Message = { role: "user", content: prompt }
        const updatedMessages = [...messages, userMessage]
        setMessages(updatedMessages)
        setPrompt("") // Clear input

        try {
            // Ensure backend is connected to a deployment
            const deploymentsResponse = await axios.get(
                `${backendUrl}/text/deployments`,
                { headers: getAuthHeaders() }
            )
            const deployments = deploymentsResponse.data || []
            const existingContainer = deployments.find(
                (d: Deployment) => {
                    const name = typeof d?.name === "string" ? d.name.toLowerCase() : ""
                    return name.includes(selected.slug.toLowerCase())
                }
            )

            if (existingContainer) {
                await axios.post(
                    `${backendUrl}/text/connect`,
                    {
                        deployment_name: existingContainer.name,
                        model_path: selectedModel
                    },
                    { headers: getAuthHeaders() }
                )
                console.log("Connected to deployment before generating:", existingContainer.name)
            } else {
                console.error("No running deployment found for model:", selectedModel)
                setIsLoading(false)
                return
            }

            const response = await axios.post(
                `${backendUrl}/text/chat`,
                {
                    messages: updatedMessages,
                    max_tokens: 256,
                    temperature: 0.7,
                    top_p: 0.9
                },
                {
                    headers: getAuthHeaders()
                }
            )
            console.log("REPLY: ", response.data)
            // Parse the reply to remove thinking tags
            const parsed = parseModelReply(response.data.reply)
            console.log("PARSED: ", parsed)

            // Store ONLY the actualReply (without thinking tags)
            const assistantMessage: Message = {
                role: "assistant",
                content: parsed.actualReply  // This ensures no thinking tags in state
            }
            setMessages([...updatedMessages, assistantMessage])

            if (parsed.thinking) {
                console.log("Model thinking:", parsed.thinking)
            }
        } catch (error) {
            console.error("Error generating text:", error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            GenerateText()
        }
    }

    const clearConversation = () => {
        setMessages([])
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

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "20px"
        }}>
            {/* Controls */}
            <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginBottom: "20px"
            }}>
                <MultiSelect
                    label="Select model for text generation"
                    placeholder="Select model"
                    data={modelOptions}
                    maxValues={1}
                    value={selectedModel ? [selectedModel] : []}
                    onChange={(value) => setSelectedModel(value[0] ?? null)}
                />
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <Button variant="filled" onClick={DeployContainer} disabled={!selectedModel}>
                        Deploy Container
                    </Button>
                    <Button variant="filled" onClick={CheckContainerStatus}>
                        Check Status
                    </Button>
                    <Button variant="filled" onClick={DeleteContainer} color="red">
                        Delete Container
                    </Button>
                    <Button variant="filled" onClick={clearConversation} color="orange">
                        Clear Conversation
                    </Button>
                </div>
            </div>

            {/* Chat Messages */}
            <ScrollArea
                style={{
                    flex: 1,
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    padding: "20px",
                    marginBottom: "20px"
                }}
            >
                {messages.length === 0 ? (
                    <Text c="dimmed" ta="center">No messages yet. Start a conversation!</Text>
                ) : (
                    messages.map((message, index) => (
                        <Paper
                            key={index}
                            p="md"
                            mb="sm"
                            style={{
                                backgroundColor: message.role === "user" ? "#e3f2fd" : "#f5f5f5",
                                marginLeft: message.role === "user" ? "20%" : "0",
                                marginRight: message.role === "user" ? "0" : "20%",
                            }}
                        >
                            <Text fw={700} size="sm" mb={5}>
                                {message.role === "user" ? "You" : "Assistant"}
                            </Text>
                            <Text style={{ whiteSpace: "pre-wrap" }}>
                                {message.content}
                            </Text>
                        </Paper>
                    ))
                )}
            </ScrollArea>

            {/* Input Area */}
            <div style={{ display: "flex", gap: "10px" }}>
                <TextInput
                    style={{ flex: 1 }}
                    placeholder="Type your message..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isLoading || !selectedModel}
                />
                <Button
                    onClick={GenerateText}
                    disabled={!selectedModel || !prompt.trim() || isLoading}
                    loading={isLoading}
                >
                    Send
                </Button>
            </div>
        </div>
    )
}