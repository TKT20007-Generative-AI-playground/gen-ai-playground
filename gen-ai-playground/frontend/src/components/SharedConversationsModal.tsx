import { Modal, Button, TagsInput, Text, CopyButton } from "@mantine/core"
import { useState } from "react"
import axios from "axios"
import { useNavigate } from "react-router-dom"

type Message = {
    id: string
    role: "user" | "assistant"
    content: string
    modelLabel?: string
    generationTimeMs?: number
    isPending?: boolean
    pendingStartTime?: number
}

type Props = {
    opened: boolean
    onClose: () => void
    currentMessages: Message[]
    modelValue: string
    backendUrl: string
}

const getCsrfToken = (): string => {
    return (
        document.cookie
            .split("; ")
            .find(c => c.startsWith("csrf_token="))
            ?.split("=")[1] ?? ""
    )
}

export function ShareConversationModal({
    opened,
    onClose,
    currentMessages,
    modelValue,
    backendUrl,
}: Props) {
    const [participants, setParticipants] = useState<string[]>([])
    const [conversationId, setConversationId] = useState<string | null>(null)
    const [inviteCode, setInviteCode] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const navigate = useNavigate()

    const shareableLink = conversationId && inviteCode
        ? `${window.location.origin}/chat/conversations/${conversationId}`
        : null

    const invCode = inviteCode ? inviteCode : ""

    const handleCreate = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await axios.post(
                `${backendUrl}/text/conversations`,
                {
                    participants,
                    title: `Shared – ${modelValue}`,
                    initial_messages: currentMessages.map(m => ({
                        role: m.role,
                        content: m.content,
                    })),
                    model_key: modelValue,
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Token": getCsrfToken(),
                    },
                    withCredentials: true,
                },
            )
            setConversationId(res.data.conversation_id)
            setInviteCode(res.data.invite_code)
        } catch (e: any) {
            setError(e.response?.data?.detail ?? e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal opened={opened} onClose={onClose} title="Share conversation">
            {!conversationId ? (
                <>
                    <Text size="sm" c="dimmed" mb="sm">
                        Invite participants by username. You can also leave this empty and share the link.
                    </Text>

                    <TagsInput
                        label="Participants (optional)"
                        placeholder="Type a username + Enter"
                        value={participants}
                        onChange={setParticipants}
                        mb="md"
                    />

                    {error && (
                        <Text c="red" size="sm" mb="sm">
                            {error}
                        </Text>
                    )}

                    <Button onClick={handleCreate} loading={loading} fullWidth>
                        Create shared conversation
                    </Button>
                </>
            ) : (
                <>
                    <Text size="sm" mb="xs">
                        Conversation created! Share this link with participants:
                    </Text>
                      <CopyButton value={shareableLink!}>
                        {({ copied, copy }) => (
                            <Button color={copied ? "teal" : "blue"} onClick={copy} fullWidth mb="md">
                                {copied ? "Copied!" : shareableLink}
                            </Button>
                        )}
                    </CopyButton>
                    <CopyButton value={invCode!}>
                        {({ copied, copy }) => (
                            <Button color={copied ? "teal" : "blue"} onClick={copy} fullWidth mb="md">
                                {copied ? "Copied!" : invCode}
                            </Button>
                        )}
                    </CopyButton>

                    <Button
                        variant="light"
                        fullWidth
                        onClick={() => {
                            navigate(`/chat/conversations/${conversationId}`, {
                                state: {
                                    modelValue,
                                    initialMessages: currentMessages,
                                    conversationId,
                                    invCode
                                },
                            })
                        }}
                    >
                        Close modal and view conversation
                    </Button>
                </>
            )}
        </Modal>
    )
}