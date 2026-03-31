import { useAuth } from "../context/AuthContext"
import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react"
import { Alert, Badge, Button, Paper, ScrollArea, Text, TextInput } from "@mantine/core"
import ActionStatus from "./ActionStatus"
import { formatDurationMs } from "../utils/time"
import { useLocation, useParams, useSearchParams } from "react-router-dom"
import axios from "axios"


type Message = {
    id: string
    role: "user" | "assistant"
    sender?: string
    content: string
    modelLabel?: string
    generationTimeMs?: number
    isPending?: boolean
    pendingStartTime?: number
    title?: string
}
const getCsrfToken = (): string => {
    const value = `; ${document.cookie}`
    const parts = value.split(`; csrf_token=`)
    if (parts.length === 2) return parts.pop()!.split(";").shift()!
    return ""
}

const getAuthHeaders = () => ({
    "Content-Type": "application/json",
    "X-CSRF-Token": getCsrfToken(),
})

const makeMessageId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return (crypto as Crypto).randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function SharedChat() {
    const { isLoggedIn, getAccessToken } = useAuth()
    const { state } = useLocation()
    const backendUrl = import.meta.env.VITE_API_URL

    const { conversationId: paramId } = useParams()
    const [searchParams] = useSearchParams()
    const modelValue: string = state?.modelValue ?? ""
    const modelLabel: string = state?.modelLabel ?? modelValue
    const conversationId: string = state?.conversationId ?? paramId ?? ""
    const initialMessages: Message[] = state?.initialMessages ?? []
    const [chatTitle, setChatTitle] = useState(state?.title ?? "")

    const currentModelRef = useRef<string>(state?.modelValue ?? "")

    const [prompt, setPrompt] = useState("")
    const [isTyping, setIsTyping] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [messages, setMessages] = useState<Message[]>(initialMessages)

    const messagesRef = useRef<Message[]>(initialMessages)
    const pendingContentRef = useRef("")
    const pendingIdRef = useRef<string | null>(null)
    const wsRef = useRef<WebSocket | null>(null)
    const bottomRef = useRef<HTMLDivElement>(null)

    const updateMessages = useCallback((next: Message[]) => {
        messagesRef.current = next
        setMessages(next)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
    }, [])

    const [inviteCode, setInviteCode] = useState(searchParams.get("invite") ?? state?.invCode ?? "")
    const [joined, setJoined] = useState(false)
    const [joining, setJoining] = useState(false)


    const handleJoin = useCallback(async (code?: string) => {
        const codeToUse = code ?? inviteCode
        if (!codeToUse) return
        setJoining(true)
        try {
            await axios.post(
                `${backendUrl}/text/conversations/${conversationId}/join`,
                { invite_code: codeToUse },
                { headers: getAuthHeaders(), withCredentials: true }
            )
            setJoined(true)
        } catch {
            setErrorMsg("Invalid invite code.")
        } finally {
            setJoining(false)
        }
    }, [inviteCode, conversationId, backendUrl])

    useEffect(() => {
        if (!conversationId) return
        axios.get(
            `${backendUrl}/text/conversations/${conversationId}/check-participant`,
            { headers: getAuthHeaders(), withCredentials: true }
        ).then(() => {
            setJoined(true) 
        }).catch(() => {
            const code = searchParams.get("invite") ?? state?.invCode
            if (code) handleJoin(code)
        })
    }, [conversationId])

    // WebSocket conn
    useEffect(() => {
        let ws: WebSocket
        if (!conversationId || !joined) return

        const connect = async () => {
            try {
                const res = await axios.get(
                    `${backendUrl}/text/conversation-history/${conversationId}`,
                    { headers: getAuthHeaders(), withCredentials: true }
                )
                setChatTitle(res.data.title ?? "")
                currentModelRef.current = res.data.model ?? state?.modelValue ?? ""
                const historical: Message[] = (res.data.messages ?? []).map((m: any) => ({
                    id: makeMessageId(),
                    role: m.role,
                    content: m.content,
                    sender: m.sender,
                    modelLabel: m.role === "assistant" ? modelLabel : undefined,
                }))
                updateMessages(historical)
            } catch {
                // non-fatal if we fail to load history, we can still chat
            }

            const wsUrl = backendUrl.replace(/^http/, "ws")
            ws = new WebSocket(`${wsUrl}/text/ws/conversations/${conversationId}`)
            wsRef.current = ws

            ws.onopen = () => {

                ws.send(JSON.stringify({
                    type: "auth",
                    token: getAccessToken()
                }))
            }

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data)

                if (data.type === "auth_ok") return
                if (data.type === "message") {
                    const msg: Message = {
                        id: makeMessageId(),
                        role: "user",
                        sender: data.sender,
                        content: data.content,
                    }
                    updateMessages([...messagesRef.current, msg])

                } else if (data.type === "assistant_typing") {
                    setIsTyping(true)
                    pendingContentRef.current = ""
                    const pendingId = makeMessageId()
                    pendingIdRef.current = pendingId
                    const pending: Message = {
                        id: pendingId,
                        role: "assistant",
                        content: "",
                        modelLabel,
                        isPending: true,
                        pendingStartTime: Date.now(),
                    }
                    updateMessages([...messagesRef.current, pending])

                } else if (data.type === "assistant_stream") {
                    pendingContentRef.current += data.delta
                    const updated = messagesRef.current.map(m =>
                        m.id === pendingIdRef.current
                            ? { ...m, content: pendingContentRef.current }
                            : m
                    )
                    updateMessages(updated)

                } else if (data.type === "assistant_done") {
                    setIsTyping(false)
                    const resolved = messagesRef.current.map(m =>
                        m.id === pendingIdRef.current
                            ? { ...m, content: data.message.content, isPending: false, pendingStartTime: undefined }
                            : m
                    )
                    updateMessages(resolved)
                    pendingIdRef.current = null

                } else if (data.type === "error") {
                    setIsTyping(false)
                    setErrorMsg(data.message ?? "Something went wrong.")
                    const withError = messagesRef.current.map(m =>
                        m.id === pendingIdRef.current
                            ? { ...m, content: "Failed to generate a response.", isPending: false, pendingStartTime: undefined }
                            : m
                    )
                    updateMessages(withError)
                    pendingIdRef.current = null
                }
            }

            ws.onerror = () => setErrorMsg("WebSocket connection error.")
            ws.onclose = () => console.log("WS closed")
        }
        connect()

        return () => ws?.close()
    }, [conversationId, backendUrl, modelLabel, joined, updateMessages])

    if (!joined) {
        return (
            <div style={{ maxWidth: 400, margin: "100px auto", padding: 20 }}>
                <Text fw={700} mb="md">Enter invite code to join</Text>
                <TextInput
                    placeholder="Paste invite code..."
                    value={inviteCode}
                    onChange={e => setInviteCode(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleJoin() }}
                />
                <Button fullWidth mt="md" onClick={() => handleJoin()} loading={joining} disabled={!inviteCode.trim()}>
                    Join
                </Button>
                {errorMsg && <Text c="red" mt="sm">{errorMsg}</Text>}
            </div>
        )
    }

    const sendMessage = () => {
        const text = prompt.trim()
        if (!text || isTyping || !wsRef.current) return

        setPrompt("")
        setErrorMsg(null)

        const userMsg: Message = { id: makeMessageId(), role: "user", content: text }
        updateMessages([...messagesRef.current, userMsg])
        wsRef.current.send(JSON.stringify({
            content: text,
            model: currentModelRef.current,
        }))
    }

    const clearMessages = () => {
        if (isTyping) return
        updateMessages([])
        setErrorMsg(null)
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    if (!isLoggedIn) {
        return (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                <Text>You must be logged in to use this chat.</Text>
            </div>
        )
    }

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                maxWidth: "760px",
                margin: "0 auto",
                padding: "24px 20px",
                boxSizing: "border-box",
                gap: "12px",
                height: "100%",
            }}
        >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <Text fw={700} size="lg">
                    Shared Chat
                </Text>
                <Badge variant="light" color="blue" size="md">
                    {chatTitle.split(" – ")[1] ?? modelLabel}
                </Badge>
            </div>

            {/* Error alert */}
            {errorMsg && (
                <Alert color="red" variant="light" p="xs" onClose={() => setErrorMsg(null)} withCloseButton>
                    {errorMsg}
                </Alert>
            )}

            {/* Toolbar */}
            <div style={{ display: "flex", gap: "8px" }}>
                <Button size="xs" color="orange" variant="light" onClick={clearMessages} disabled={isTyping}>
                    Clear
                </Button>
            </div>

            {/* Message list */}
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
                    <Text c="dimmed" ta="center" size="sm" mt="xl">
                        No messages yet. Start the conversation below.
                    </Text>
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
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: "8px",
                                    marginBottom: "4px",
                                }}
                            >
                                <Text fw={700} size="xs">
                                    {message.role === "user" ? message.sender : (message.modelLabel ?? modelLabel)}
                                </Text>
                                {message.role === "assistant" && message.generationTimeMs != null && (
                                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                                        Response time: {formatDurationMs(message.generationTimeMs)}
                                    </Text>
                                )}
                            </div>

                            {message.isPending ? (
                                message.pendingStartTime ? (
                                    <ActionStatus actionText="Generating" startTime={message.pendingStartTime} />
                                ) : null
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

            {/* Input */}
            <div style={{ display: "flex", gap: "10px" }}>
                <TextInput
                    style={{ flex: 1, minWidth: 0 }}
                    placeholder="Type a message..."
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isTyping}
                />
                <Button onClick={sendMessage} disabled={!prompt.trim() || isTyping} loading={isTyping}>
                    Send
                </Button>
            </div>
        </div>
    )
}