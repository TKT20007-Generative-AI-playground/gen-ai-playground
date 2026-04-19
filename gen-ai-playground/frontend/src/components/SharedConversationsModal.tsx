import { Modal, Button, TagsInput, Text, CopyButton } from "@mantine/core"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { getAxiosDetailMessage } from "../utils/errors"
import { createSharedConversation } from "../services/textService"

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

type Props = {
    opened: boolean
    onClose: () => void
    currentMessages: Message[]
    modelValue: string
}

export function ShareConversationModal({
    opened,
    onClose,
    currentMessages,
    modelValue,
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
            const res = await createSharedConversation({
                participants,
                title: `Shared – ${modelValue}`,
                initial_messages: currentMessages.map(m => ({
                    role: m.role,
                    content: m.content,
                    reasoning: m.reasoning ?? null,
                })),
                model_key: modelValue,
            })
            setConversationId(res.conversation_id)
            setInviteCode(res.invite_code)
        } catch (e: unknown) {
            setError(getAxiosDetailMessage(e) ?? "Failed to create shared conversation")
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