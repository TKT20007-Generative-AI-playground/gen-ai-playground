import { useCallback, useEffect, useRef, useState } from "react"
import axios from "axios"
import { useNavigate, useLocation } from "react-router-dom"
import type {
  AudioRecord,
  ConversationRecord,
  ImageRecord,
  PromptGroup,
  TextRecord,
} from "./history-ui/historyInterfaces"
import DateRangePicker from "./history-ui/DateRangePicker"
import ImageCard from "./history-ui/ImageCard"
import TextCard from "./history-ui/TextCard"
import AudioCard from "./history-ui/AudioCard"
import EmptyState from "./history-ui/EmptyState"
import { TextIcon, ImageIcon, DownloadIcon, EditIcon, AudioIcon } from "./history-ui/Icons"
import { getTypeColor, getTypeIcon, getTypeLabel, formatDate } from "./history-ui/ImageUtils"
import { HoverTab } from "./history-ui/HoverTab"
import {
  Stack,
  Text,
  Badge,
  ScrollArea,
  Loader,
  Center,
  Modal,
  Button,
  Tabs,
  Group,
  Box,
  ActionIcon,
  Tooltip,
  Transition,
  SimpleGrid,
  Pagination,
} from "@mantine/core"
import { useMediaQuery } from "@mantine/hooks"
import { EDIT_MODELS } from "../constants/models"
import ConversationCard from "./history-ui/ConversationCard"

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

const HISTORY_PAGE_SIZE = 10



export default function History() {
  const backendUrl = import.meta.env.VITE_API_URL
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useMediaQuery("(max-width: 600px)")
  const isTablet = useMediaQuery("(max-width: 900px)")

  const [imageHistory, setImageHistory] = useState<PromptGroup[]>([])
  const [textHistory, setTextHistory] = useState<TextRecord[]>([])
  const [audioHistory, setAudioHistory] = useState<AudioRecord[]>([])
  const [conversationHistory, setConversationHistory] = useState<ConversationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<ImageRecord | null>(null)

  type Tab = "images" | "text" | "audio" | "conversations"
  type HistoryLocationState = {
    tab?: Tab
    targetIndex?: number
    targetConversationId?: string
    scrollBlock?: ScrollLogicalPosition
  }

  const locationState = (location.state ?? {}) as HistoryLocationState
  const normalizedTargetIndex = Number.isInteger(locationState.targetIndex) && (locationState.targetIndex as number) >= 0
    ? (locationState.targetIndex as number)
    : null

  const [activeTab, setActiveTab] = useState<Tab>(
    locationState.tab ?? "images"
  )
  const [scrollTarget, setScrollTarget] = useState<{
    tab: Tab
    targetIndex: number
    targetConversationId?: string
    pageSize: number
    scrollBlock: ScrollLogicalPosition
  } | null>(null)

  useEffect(() => {
    if (locationState.tab) {
      setActiveTab(locationState.tab)
    }
  }, [locationState.tab])

  useEffect(() => {
    if (!locationState.tab) {
      return
    }
    const targetTab: Tab = locationState.tab

    const normalizedIndex = Number.isInteger(locationState.targetIndex) && (locationState.targetIndex as number) >= 0
      ? (locationState.targetIndex as number)
      : null

    if (normalizedIndex === null) {
      return
    }

    const targetPage = Math.floor(normalizedIndex / HISTORY_PAGE_SIZE) + 1

    setPages(prev => ({
      ...prev,
      [targetTab]: targetPage,
    }))

    setScrollTarget({
      tab: targetTab,
      targetIndex: normalizedIndex,
      targetConversationId: locationState.targetConversationId,
      pageSize: HISTORY_PAGE_SIZE,
      scrollBlock: locationState.scrollBlock ?? (normalizedIndex % HISTORY_PAGE_SIZE === HISTORY_PAGE_SIZE - 1 ? "end" : "start"),
    })
  }, [
    locationState.scrollBlock,
    locationState.tab,
    locationState.targetConversationId,
    locationState.targetIndex,
  ])
  
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null])

  const [totalItems, setTotalItems] = useState<Record<Tab, number>>({
    images: 0,
    text: 0,
    audio: 0,
    conversations: 0,
  })


  const [pages, setPages] = useState<Record<Tab, number>>({
    images:
      locationState.tab === "images" && normalizedTargetIndex !== null
        ? Math.floor(normalizedTargetIndex / HISTORY_PAGE_SIZE) + 1
        : 1,
    text:
      locationState.tab === "text" && normalizedTargetIndex !== null
        ? Math.floor(normalizedTargetIndex / HISTORY_PAGE_SIZE) + 1
        : 1,
    audio:
      locationState.tab === "audio" && normalizedTargetIndex !== null
        ? Math.floor(normalizedTargetIndex / HISTORY_PAGE_SIZE) + 1
        : 1,
    conversations:
      locationState.tab === "conversations" && normalizedTargetIndex !== null
        ? Math.floor(normalizedTargetIndex / HISTORY_PAGE_SIZE) + 1
        : 1,
  })
  const [totalPages, setTotalPages] = useState<Record<Tab, number>>({
    images: 1,
    text: 1,
    audio: 1,
    conversations: 1,
  })
  const currentPage = pages[activeTab]
  const requestIdRef = useRef(0)

  const buildParams = (range: [Date | null, Date | null], pageNum: number) => {
    const [from, to] = range
    const params = new URLSearchParams()
    params.append("page", pageNum.toString())

    if (from) {
      const fromDate = new Date(from)
      fromDate.setHours(0, 0, 0, 0)
      params.append("from", fromDate.getTime().toString())

      const toDate = new Date(to ?? from)
      toDate.setHours(23, 59, 59, 999)
      params.append("to", toDate.getTime().toString())
    }

    return params
  }

  const fetchConversationHistory = useCallback(
    async (range: [Date | null, Date | null], pageNum: number) => {
      const params = buildParams(range, pageNum)

      try {
        const his = await axios.get(
          `${backendUrl}/text/all-conversations`,
          { headers: getAuthHeaders(), withCredentials: true, params }
        )

        return {
          history: his.data.conversations || [],
          totalPages: his.data.total_pages || 1,
        }
      } catch (e) {
        console.log("Failed to fetch conversations", e)
        return {
          history: [],
          totalPages: 1,
        }
      }
    },
    [backendUrl],
  )

  const fetchTextHistory = useCallback(
    async (range: [Date | null, Date | null], pageNum: number) => {
      const headers = {
        "Content-Type": "application/json",
      }

      const params = buildParams(range, pageNum)

      const res = await axios.get(`${backendUrl}/text/history`, {
        headers,
        params,
      })

      return {
        history: res.data.history || [],
        totalPages: res.data.total_pages || 1,
      }
    },
    [backendUrl],
  )

  const fetchImagesHistory = useCallback(
    async (range: [Date | null, Date | null], pageNum: number) => {
      const headers = {
        "Content-Type": "application/json",
      }
      const params = buildParams(range, pageNum)

      const imgRes = await axios.get(`${backendUrl}/images/history`, {
        headers,
        params,
      })

      const groups: { [prompt: string]: ImageRecord[] } = {}
        ; (imgRes.data.history || []).forEach((item: ImageRecord) => {
          const key = item.prompt.trim().toLowerCase()
          if (!groups[key]) groups[key] = []
          groups[key].push(item)
        })

      return {
        grouped: Object.keys(groups).map(prompt => ({
          prompt,
          images: groups[prompt],
        })),
        totalPages: imgRes.data.total_pages || 1,
      }
    },
    [backendUrl],
  )

  const fetchAudioHistory = useCallback(
    async (range: [Date | null, Date | null], pageNum: number) => {
      const params = buildParams(range, pageNum)

      const res = await axios.get(`${backendUrl}/audio/history`, {
        headers: getAuthHeaders(),
        params,
        withCredentials: true,
      })

      return {
        history: res.data.history || [],
        totalPages: res.data.total_pages || 1,
      }
    },
    [backendUrl],
  )

  const getImagesLength = useCallback(async () => {
    try {
      const res = await axios.get(`${backendUrl}/images/history-length`, {
        headers: getAuthHeaders(),
        withCredentials: true,
      })
      return res.data.length ?? 0
    } catch {
      return 0
    }
  }, [backendUrl])

  const getTextLength = useCallback(async () => {
    try {
      const res = await axios.get(`${backendUrl}/text/chat-messages-length`, {
        headers: getAuthHeaders(),
        withCredentials: true,
      })
      return res.data.length ?? 0
    } catch {
      return 0
    }
  }, [backendUrl])

  const getAudioLength = useCallback(async () => {
    try {
      const res = await axios.get(`${backendUrl}/audio/history`, {
        headers: getAuthHeaders(),
        withCredentials: true,
        params: { page: 1 },
      })
      return res.data.total ?? 0
    } catch {
      return 0
    }
  }, [backendUrl])

  const getConversationLength = useCallback(async () => {
    try {
      const res = await axios.get(`${backendUrl}/text/conversations-length`, {
        headers: getAuthHeaders(),
        withCredentials: true,
      })
      return res.data.length ?? 0
    } catch {
      return 0
    }
  }, [backendUrl])

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    let isCancelled = false

    const run = async () => {
      setLoading(true)

      const [imagesLength, textLength, audioLength, conversationLength] = await Promise.all([
        getImagesLength(),
        getTextLength(),
        getAudioLength(),
        getConversationLength(),
      ])

      if (isCancelled || requestIdRef.current !== requestId) {
        return
      }

      setTotalItems({
        images: imagesLength,
        text: textLength,
        audio: audioLength,
        conversations: conversationLength,
      })

      try {
        if (activeTab === "images") {
          const data = await fetchImagesHistory(dateRange, currentPage)
          if (isCancelled || requestIdRef.current !== requestId) return

          setImageHistory(data.grouped)
          setTotalPages(prev => ({
            ...prev,
            images: data.totalPages,
          }))
        } else if (activeTab === "text") {
          const data = await fetchTextHistory(dateRange, currentPage)
          if (isCancelled || requestIdRef.current !== requestId) return

          setTextHistory(data.history)
          setTotalPages(prev => ({
            ...prev,
            text: data.totalPages,
          }))
        } else if (activeTab === "audio") {
          const data = await fetchAudioHistory(dateRange, currentPage)
          if (isCancelled || requestIdRef.current !== requestId) return

          setAudioHistory(data.history)
          setTotalPages(prev => ({
            ...prev,
            audio: data.totalPages,
          }))
        } else if (activeTab === "conversations") {
          const data = await fetchConversationHistory(dateRange, currentPage)
          if (isCancelled || requestIdRef.current !== requestId) return

          setConversationHistory(data.history)
          setTotalPages(prev => ({
            ...prev,
            conversations: data.totalPages,
          }))
        }
      } catch (err) {
        console.error("Failed to fetch history:", err)
      } finally {
        if (!isCancelled && requestIdRef.current === requestId) {
          setLoading(false)
        }
      }
    }

    run()

    return () => {
      isCancelled = true
    }
  }, [activeTab, dateRange, currentPage,
    fetchImagesHistory, fetchTextHistory, fetchAudioHistory, fetchConversationHistory,
    getImagesLength, getTextLength, getAudioLength, getConversationLength])

  const handleDateChange = (range: [Date | null, Date | null]) => {
    setDateRange(range)
    setPages({
      images: 1,
      text: 1,
      audio: 1,
      conversations: 1,
    })
  }

  const columns = isMobile ? 2 : isTablet ? 3 : 4
  let imageLocalIndex = -1

  useEffect(() => {
    if (!scrollTarget || loading || activeTab !== scrollTarget.tab) {
      return
    }

    const hasRenderedDataForTab =
      (activeTab === "images" && imageHistory.length > 0) ||
      (activeTab === "text" && textHistory.length > 0) ||
      (activeTab === "audio" && audioHistory.length > 0) ||
      (activeTab === "conversations" && conversationHistory.length > 0)

    if (!hasRenderedDataForTab) {
      return
    }

    const executeFallbackScroll = () => {
      const fallbackTop = scrollTarget.scrollBlock === "end"
        ? Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
        : 0
      window.scrollTo({ top: fallbackTop, behavior: "smooth" })
    }

    const tryScroll = () => {
      const localIndex = scrollTarget.targetIndex % scrollTarget.pageSize
      const selectorById = scrollTarget.tab === "conversations" && scrollTarget.targetConversationId
        ? `[data-history-tab="conversations"][data-conversation-id="${scrollTarget.targetConversationId}"]`
        : null
      const selectorByTabAndIndex = `[data-history-tab="${scrollTarget.tab}"][data-history-local-index="${localIndex}"]`

      const targetElement = selectorById
        ? document.querySelector(selectorById)
        : document.querySelector(selectorByTabAndIndex)

      if (targetElement instanceof HTMLElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: scrollTarget.scrollBlock })
      } else {
        executeFallbackScroll()
      }

      setScrollTarget(null)
    }

    const frameId = window.requestAnimationFrame(tryScroll)
    return () => window.cancelAnimationFrame(frameId)
  }, [
    activeTab,
    loading,
    scrollTarget,
    imageHistory.length,
    textHistory.length,
    audioHistory.length,
    conversationHistory.length,
  ])

  return (
    <Box
      style={{
        minHeight: "100vh",

        color: "rgba(255,255,255,0.85)",
      }}
    >
      <Box
        px={isMobile ? 16 : 40}
        pt={isMobile ? 24 : 44}
        pb={0}
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Stack gap={6} mb={28}>
          <Text
            style={{
              fontSize: isMobile ? 24 : 30,
              fontWeight: 800,
              letterSpacing: "-0.6px",
              color: "black",
              lineHeight: 1.1,
            }}
          >
            History
          </Text>
          <Text size="sm" c="dimmed" style={{ letterSpacing: 0.1 }}>
            Browse your past generations
          </Text>
        </Stack>
        <Tabs value={activeTab} onChange={value => setActiveTab(value as Tab)} variant="default">
          <Tabs.List>
            <HoverTab value="images" leftSection={<ImageIcon />}>
              Images
              {totalItems.images > 0 && (
                <Badge
                  ml={8}
                  size="xs"
                  variant="filled"
                  radius="xl"
                  style={{
                    background: "rgba(0, 0, 0, 0.08)",
                    color: "black",
                    fontWeight: 600,
                    minWidth: 22,
                    height: 18,
                  }}
                >
                  {totalItems.images}
                </Badge>
              )}
            </HoverTab>

            <HoverTab value="text" leftSection={<TextIcon />}>
              Text
              {totalItems.text > 0 && (
                <Badge
                  ml={8}
                  size="xs"
                  variant="filled"
                  radius="xl"
                  style={{
                    background: "rgba(10, 10, 10, 0.08)",
                    color: "black",
                    fontWeight: 600,
                    minWidth: 22,
                    height: 18,
                  }}
                >
                  {totalItems.text}
                </Badge>
              )}
            </HoverTab>
            <HoverTab value="conversations" leftSection={<TextIcon />}>
              Conversations
              {totalItems.conversations > 0 && (
                <Badge
                  ml={8}
                  size="xs"
                  variant="filled"
                  radius="xl"
                  style={{
                    background: "rgba(10, 10, 10, 0.08)",
                    color: "black",
                    fontWeight: 600,
                    minWidth: 22,
                    height: 18,
                  }}
                >
                  {totalItems.conversations}
                </Badge>
              )}
            </HoverTab>

            <HoverTab value="audio" leftSection={<AudioIcon />}>
              Transcribe
              {totalItems.audio > 0 && (
                <Badge
                  ml={8}
                  size="xs"
                  variant="filled"
                  radius="xl"
                  style={{
                    background: "rgba(10, 10, 10, 0.08)",
                    color: "black",
                    fontWeight: 600,
                    minWidth: 22,
                    height: 18,
                  }}
                >
                  {totalItems.audio}
                </Badge>
              )}
            </HoverTab>
          </Tabs.List>
        </Tabs>
      </Box>
      {/* Date range picker */}
      <Box px={isMobile ? 0 : 40} py={isMobile ? 20 : 36}>
        <Group justify="space-between" align="center" wrap="nowrap">
          <DateRangePicker
            dateRange={dateRange}
            setDateRange={range => {
              handleDateChange(range)
            }}
          />
        </Group>
      </Box>

      {/* Content */}
      <Box px={isMobile ? 16 : 40} py={isMobile ? 20 : 36}>
        {loading ? (
          <Center py={80}>
            <Stack align="center" gap="sm">
              <Loader size="sm" color="gray" type="dots" />
              <Text size="xs" c="dimmed">
                Loading history…
              </Text>
            </Stack>
          </Center>
        ) : activeTab === "images" ? (
          imageHistory.length === 0 ? (
            <EmptyState label="No image history yet. Start generating to see your creations here." />
          ) : (
            <ScrollArea>
              <Stack gap={44}>
                {imageHistory.map((group, idx) => (
                  <Stack key={idx} gap={16}>
                    {/* Prompt heading */}
                    <Group gap={10} align="center">
                      <Box
                        style={{
                          width: 3,
                          height: 18,
                          borderRadius: 3,
                          background: "linear-gradient(to bottom, #7c6af7, #4dabf7)",
                          flexShrink: 0,
                        }}
                      />
                      <Text
                        data-testid={`prompt-${group.prompt}`}
                        size="sm"
                        fw={500}
                        style={{
                          color: "black",
                          fontStyle: "italic",
                          lineHeight: 1.4,
                        }}
                      >
                        "{group.prompt}"
                      </Text>
                      <Badge size="xs" variant="light" color="gray" radius="xl">
                        {group.images.length} {group.images.length === 1 ? "image" : "images"}
                      </Badge>
                    </Group>

                    {/* Image grid */}
                    <SimpleGrid cols={columns} spacing={isMobile ? 10 : 16}>
                      {group.images.filter(Boolean).map((item, i) => {
                        imageLocalIndex += 1
                        return (
                          <div
                            key={i}
                            data-history-tab="images"
                            data-history-local-index={imageLocalIndex}
                          >
                            <ImageCard item={item} onClick={() => setSelectedImage(item)} />
                          </div>
                        )
                      })}
                    </SimpleGrid>
                  </Stack>
                ))}
                {totalPages[activeTab] > 1 && (
                  <Group justify="center" mt="md">
                    <Pagination
                      total={totalPages[activeTab]}
                      value={pages[activeTab]}
                      onChange={newPage => {
                        if (newPage == null) return
                        setPages(prev => ({
                          ...prev,
                          [activeTab]: newPage,
                        }))
                        window.scrollTo({ top: 0, behavior: "smooth" })
                      }}
                    />
                  </Group>
                )}
              </Stack>
            </ScrollArea>
          )
        ) : activeTab === "text" ? (
          textHistory.length === 0 ? (
            <EmptyState label="No text history yet. Start a conversation to see responses here." />
          ) : (
            <ScrollArea>
              <Stack gap={12}>
                {textHistory.map((item, idx) => (
                  <Transition key={idx} mounted transition="fade" duration={200}>
                    {styles => (
                      <div
                        style={{ ...styles, animationDelay: `${idx * 30}ms` }}
                        data-history-tab="text"
                        data-history-local-index={idx}
                      >
                        <TextCard item={item} />
                      </div>
                    )}
                  </Transition>
                ))}
                <Group justify="center" mt="md">
                  <Pagination
                    total={totalPages[activeTab]}
                    value={pages[activeTab]}
                    onChange={newPage => {
                      if (newPage == null) return
                      setPages(prev => ({
                        ...prev,
                        [activeTab]: newPage,
                      }))
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }}
                  />
                </Group>
              </Stack>
            </ScrollArea>
          )
        ) : activeTab === "audio" ? (
          audioHistory.length === 0 ? (
            <EmptyState label="No transcription history yet. Run transcription to see outputs here." />
          ) : (
            <ScrollArea>
              <Stack gap={12}>
                {audioHistory.map((item, idx) => (
                  <Transition key={idx} mounted transition="fade" duration={200}>
                    {styles => (
                      <div
                        style={{ ...styles, animationDelay: `${idx * 30}ms` }}
                        data-history-tab="audio"
                        data-history-local-index={idx}
                      >
                        <AudioCard item={item} />
                      </div>
                    )}
                  </Transition>
                ))}
                <Group justify="center" mt="md">
                  <Pagination
                    total={totalPages[activeTab]}
                    value={pages[activeTab]}
                    onChange={newPage => {
                      if (newPage == null) return
                      setPages(prev => ({
                        ...prev,
                        [activeTab]: newPage,
                      }))
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }}
                  />
                </Group>
              </Stack>
            </ScrollArea>
          )
        ) : conversationHistory.length === 0 ? (
          <EmptyState label="No shared conversation history yet. Start a shared conversation to see responses here." />
        ) : (
          <ScrollArea>
            <Stack gap={12}>
              {conversationHistory.map((item, idx) => (
                <Transition key={idx} mounted transition="fade" duration={200}>
                  {styles => (
                    <div
                      style={{ ...styles, animationDelay: `${idx * 30}ms` }}
                      data-history-tab="conversations"
                      data-history-local-index={idx}
                      data-conversation-id={item._id}
                    >
                      <ConversationCard item={item} />
                    </div>
                  )}
                </Transition>
              ))}
              <Group justify="center" mt="md">
                <Pagination
                  total={totalPages[activeTab]}
                  value={pages[activeTab]}
                  onChange={newPage => {
                    if (newPage == null) return
                    setPages(prev => ({
                      ...prev,
                      [activeTab]: newPage,
                    }))
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }}
                />
              </Group>
            </Stack>
          </ScrollArea>
        )
        }
      </Box>

      {/* Image Modal */}
      <Modal
        opened={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        centered
        size={isMobile ? "95%" : "lg"}
        withinPortal
        yOffset={0}
        scrollAreaComponent={ScrollArea}
        radius="lg"
        styles={{
          content: {
            background: "linear-gradient(180deg, #1c1c22 0%, #18181e 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
          },
          header: {
            background: "transparent",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            paddingBottom: 14,
          },
          title: { color: "white", fontWeight: 600 },
          close: { color: "rgba(255,255,255,0.35)", "&:hover": { color: "white" } },
          overlay: { backdropFilter: "blur(6px)" },
        }}
        title={
          selectedImage ? (
            <Group gap="xs" align="center">
              <Badge
                size="sm"
                variant="light"
                color={getTypeColor(selectedImage.image_type)}
                radius="sm"
                leftSection={getTypeIcon(selectedImage.image_type)}
              >
                {getTypeLabel(selectedImage.image_type)}
              </Badge>
              <Text
                size="sm"
                style={{
                  fontStyle: "italic",
                  color: "rgba(255,255,255,0.6)",
                }}
                lineClamp={1}
              >
                "{selectedImage.prompt}"
              </Text>
            </Group>
          ) : null
        }
      >
        {selectedImage?.image_data && (
          <Stack gap="md" pt={4}>
            {/* Image display */}
            <Box
              style={{
                borderRadius: 12,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.05)",
                background: "rgba(0,0,0,0.2)",
              }}
            >
              <img
                data-testid="modal-image"
                src={`data:image/png;base64,${selectedImage.image_data}`}
                alt={selectedImage.prompt}
                style={{
                  width: "100%",
                  height: "auto",
                  maxHeight: "65vh",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </Box>

            {/* Meta info */}
            <Group justify="space-between" align="center">
              <Group gap="xs">
                <Badge
                  size="sm"
                  variant="dot"
                  color="blue"
                  radius="sm"
                  style={{ textTransform: "none" }}
                >
                  {selectedImage.model}
                </Badge>
                <Text size="xs" c="dimmed">
                  {formatDate(selectedImage.timestamp)}
                </Text>
              </Group>

              {/* Download button */}
              <Tooltip label="Download image" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="md"
                  onClick={() => {
                    const link = document.createElement("a")
                    link.href = `data:image/png;base64,${selectedImage.image_data}`
                    link.download = `${selectedImage.prompt.slice(0, 40).replace(/[^a-z0-9]/gi, "_")}.png`
                    link.click()
                  }}
                >
                  <DownloadIcon />
                </ActionIcon>
              </Tooltip>
            </Group>

            {/* Action button */}
            <Button
              fullWidth
              variant="light"
              color="violet"
              radius="md"
              leftSection={<EditIcon />}
              style={{
                fontWeight: 600,
                letterSpacing: 0.2,
              }}
              onClick={() => {
                const img = selectedImage
                setSelectedImage(null)
                setTimeout(() => {
                  navigate("/playground/ImageEditor", {
                    state: {
                      imageToEdit: {
                        id: img.id,
                        image_data: img.image_data,
                        image_type: img.image_type,
                        prompt: img.prompt,
                        model: img.model || EDIT_MODELS[0],
                      },
                    },
                  })
                }, 0)
              }}
            >
              Edit in Playground
            </Button>
          </Stack>
        )}
      </Modal>
    </Box>
  )
}
