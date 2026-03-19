import { useCallback, useEffect, useState } from "react"
import axios from "axios"
import { useNavigate } from "react-router-dom"
import type { ImageRecord, PromptGroup, TextRecord } from "./history-ui/historyInterfaces"
import DateRangePicker from "./history-ui/DateRangePicker"
import ImageCard from "./history-ui/ImageCard"
import TextCard from "./history-ui/TextCard"
import EmptyState from "./history-ui/EmptyState"
import { TextIcon, ImageIcon, DownloadIcon, EditIcon} from "./history-ui/Icons"
import { getTypeColor, getTypeIcon, getTypeLabel, formatDate } from "./history-ui/imageUtils"
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
  Paper,
  Box,
  ActionIcon,
  Tooltip,
  Transition,
  SimpleGrid,
  Card,
  Overlay,
  ThemeIcon,
  Divider,
  rem,
  Pagination,
} from "@mantine/core"
import { useMediaQuery } from "@mantine/hooks"
import { EDIT_MODELS } from "../constants/models"

// function DateRangePicker({
//   dateRange,
//   setDateRange,
// }: {
//   dateRange: [Date | null, Date | null]
//   setDateRange: (dateRange: [Date | null, Date | null]) => void
// }) {
//   return (
//     <DatePickerInput
//       type="range"
//       allowSingleDateInRange
//       placeholder="Pick date range"
//       value={dateRange}
//       onChange={value => setDateRange(value as [Date | null, Date | null])}
//       clearable
//       w={260}
//     />
//   )
// }

// inline svg icons

// const ImageIcon = () => (
//   <svg
//     width="16"
//     height="16"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//     strokeLinecap="round"
//     strokeLinejoin="round"
//   >
//     <rect x="3" y="3" width="18" height="18" rx="2" />
//     <circle cx="8.5" cy="8.5" r="1.5" />
//     <polyline points="21 15 16 10 5 21" />
//   </svg>
// )

// const TextIcon = () => (
//   <svg
//     width="16"
//     height="16"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//     strokeLinecap="round"
//     strokeLinejoin="round"
//   >
//     <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
//     <polyline points="14 2 14 8 20 8" />
//     <line x1="16" y1="13" x2="8" y2="13" />
//     <line x1="16" y1="17" x2="8" y2="17" />
//     <polyline points="10 9 9 9 8 9" />
//   </svg>
// )

// const EditIcon = () => (
//   <svg
//     width="14"
//     height="14"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//     strokeLinecap="round"
//     strokeLinejoin="round"
//   >
//     <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
//     <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
//   </svg>
// )

// const ClockIcon = () => (
//   <svg
//     width="12"
//     height="12"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//     strokeLinecap="round"
//     strokeLinejoin="round"
//   >
//     <circle cx="12" cy="12" r="10" />
//     <polyline points="12 6 12 12 16 14" />
//   </svg>
// )

// const CopyIcon = () => (
//   <svg
//     width="14"
//     height="14"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//     strokeLinecap="round"
//     strokeLinejoin="round"
//   >
//     <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
//     <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
//   </svg>
// )

// const SparkleIcon = () => (
//   <svg
//     width="12"
//     height="12"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//     strokeLinecap="round"
//     strokeLinejoin="round"
//   >
//     <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
//   </svg>
// )

// const BrushIcon = () => (
//   <svg
//     width="12"
//     height="12"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//     strokeLinecap="round"
//     strokeLinejoin="round"
//   >
//     <path d="M18.37 2.63a2.12 2.12 0 0 1 3 3L14 13l-4 1 1-4 7.37-7.37z" />
//     <path d="M9 14.5A3.5 3.5 0 0 0 5.5 18H3v2h2.5A5.5 5.5 0 0 0 11 14.5" />
//   </svg>
// )

// const DownloadIcon = () => (
//   <svg
//     width="14"
//     height="14"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//     strokeLinecap="round"
//     strokeLinejoin="round"
//   >
//     <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
//     <polyline points="7 10 12 15 17 10" />
//     <line x1="12" y1="15" x2="12" y2="3" />
//   </svg>
// )

// interfaces

// interface ImageRecord {
//   prompt: string
//   model: string
//   timestamp: string
//   image_data: string
//   image_type: string | null | undefined
// }

// interface PromptGroup {
//   prompt: string
//   images: ImageRecord[]
// }

// interface Message {
//   role: string
//   content: string
// }

// interface TextRecord {
//   response: string
//   type: string
//   messages: Message[]
//   reply: string
//   model: string
//   timestamp: string
//   username: string
//   usage?: {
//     prompt_tokens?: number
//     total_tokens?: number
//     completion_tokens?: number
//     prompt_tokens_details?: String
//     reasoning_tokens?: number
//   }
//   generation_time_ms?: number
// }

// helpers

const backendUrl = import.meta.env.VITE_API_URL

// export function formatDate(ts: string) {
//   const d = new Date(ts)
//   return (
//     d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
//     "  ·  " +
//     d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
//   )
// }

// function getTypeColor(type: string | null | undefined): string {
//   switch (type) {
//     case "generated":
//       return "teal"
//     case "edited":
//       return "violet"
//     case "original":
//       return "gray"
//     default:
//       return "gray"
//   }
// }

// function getTypeLabel(type: string | null | undefined): string {
//   switch (type) {
//     case "generated":
//       return "Generated"
//     case "edited":
//       return "Edited"
//     case "original":
//       return "Original"
//     default:
//       return type || "Unknown"
//   }
// }

// function getTypeIcon(type: string | null | undefined) {
//   switch (type) {
//     case "generated":
//       return <SparkleIcon />
//     case "edited":
//       return <BrushIcon />
//     default:
//       return <ImageIcon />
//   }
// }

// small components

// function EmptyState({ label }: { label: string }) {
//   return (
//     <Center py={80}>
//       <Stack align="center" gap="md">
//         <ThemeIcon size={56} radius="xl" variant="light" color="gray" style={{ opacity: 0.5 }}>
//           <svg
//             width="22"
//             height="22"
//             viewBox="0 0 24 24"
//             fill="none"
//             stroke="currentColor"
//             strokeWidth="1.5"
//           >
//             <circle cx="12" cy="12" r="10" />
//             <line x1="12" y1="8" x2="12" y2="12" />
//             <line x1="12" y1="16" x2="12.01" y2="16" />
//           </svg>
//         </ThemeIcon>
//         <Text size="sm" c="dimmed" ta="center">
//           {label}
//         </Text>
//       </Stack>
//     </Center>
//   )
// }

// function ImageCard({ item, onClick }: { item: ImageRecord; onClick: () => void }) {
//   const [hovered, setHovered] = useState(false)

//   return (
//     <Card
//       shadow={hovered ? "xl" : "sm"}
//       radius="lg"
//       p={0}
//       style={{
//         cursor: "pointer",
//         overflow: "hidden",
//         transition:
//           "transform 0.25s cubic-bezier(.4,0,.2,1), box-shadow 0.25s cubic-bezier(.4,0,.2,1)",
//         transform: hovered ? "translateY(-4px) scale(1.015)" : "none",
//         border: hovered ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.06)",
//         background: "rgba(255,255,255,0.025)",
//       }}
//       onMouseEnter={() => setHovered(true)}
//       onMouseLeave={() => setHovered(false)}
//       onClick={onClick}
//     >
//       {/* Image area */}
//       <Box style={{ position: "relative", aspectRatio: "1 / 1", overflow: "hidden" }}>
//         <img
//           data-testid={`image-${item.prompt}-${item.model}`}
//           src={`data:image/png;base64,${item.image_data}`}
//           alt={item.prompt}
//           style={{
//             width: "100%",
//             height: "100%",
//             objectFit: "cover",
//             transition: "transform 0.4s cubic-bezier(.4,0,.2,1)",
//             transform: hovered ? "scale(1.06)" : "scale(1)",
//             display: "block",
//           }}
//         />

//         {/* Type badge – always visible, pinned top-right */}
//         <Badge
//           data-testid={item.image_type}
//           size="xs"
//           variant="filled"
//           color={getTypeColor(item.image_type)}
//           radius="sm"
//           leftSection={getTypeIcon(item.image_type)}
//           style={{
//             position: "absolute",
//             top: 8,
//             right: 8,
//             zIndex: 2,
//             textTransform: "capitalize",
//             fontSize: 10,
//             fontWeight: 600,
//             backdropFilter: "blur(8px)",
//             boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
//           }}
//         >
//           {getTypeLabel(item.image_type)}
//         </Badge>

//         {/* Hover overlay with prompt */}
//         <Overlay
//           gradient="linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.35) 40%, transparent 70%)"
//           opacity={hovered ? 1 : 0}
//           style={{
//             transition: "opacity 0.3s ease",
//             display: "flex",
//             alignItems: "flex-end",
//             padding: 14,
//             pointerEvents: "none",
//           }}
//           zIndex={1}
//         >
//           <Text
//             size="xs"
//             c="white"
//             lineClamp={3}
//             style={{
//               fontStyle: "italic",
//               lineHeight: 1.5,
//               textShadow: "0 1px 3px rgba(0,0,0,0.5)",
//             }}
//           >
//             "{item.prompt}"
//           </Text>
//         </Overlay>
//       </Box>

//       {/* Info bar */}
//       <Box px={2} py={10} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
//         <Group justify="space-between" align="center" wrap="nowrap">
//           <Badge
//             data-testid={`model-${item.prompt}-${item.model}`}
//             size="xs"
//             variant="dot"
//             color="blue"
//             radius="sm"
//             style={{ textTransform: "none", letterSpacing: 0.2, fontSize: 10, maxWidth: "60%" }}
//           >
//             {item.model}
//           </Badge>
//           <Group gap={4} align="center" wrap="nowrap">
//             <Box c="dimmed" style={{ display: "flex" }}>
//               <ClockIcon />
//             </Box>
//             <Text
//               data-testid={`timestamp-${item.prompt}-${item.model}`}
//               size="xs"
//               c="dimmed"
//               style={{ fontSize: 10, whiteSpace: "nowrap" }}
//             >
//               {new Date(item.timestamp).toLocaleDateString()}
//             </Text>
//           </Group>
//         </Group>
//       </Box>
//     </Card>
//   )
// }

// function TextCard({ item }: { item: TextRecord }) {
//   const [copied, setCopied] = useState(false)
//   const [expanded, setExpanded] = useState(false)

//   const prompt = [...item.messages].reverse().find(m => m.role === "user")?.content ?? ""

//   const response = item.reply

//   const handleCopy = (e: React.MouseEvent) => {
//     e.stopPropagation()
//     navigator.clipboard.writeText(response).then(() => {
//       setCopied(true)
//       setTimeout(() => setCopied(false), 1800)
//     })
//   }

//   const isLong = response.length > 300
//   const displayText = isLong && !expanded ? response.slice(0, 300) + "…" : response

//   return (
//     <Paper
//       p="md"
//       radius="lg"
//       style={{
//         background: "rgba(255,255,255,0.025)",
//         border: "1px solid rgba(255,255,255,0.06)",
//         transition: "border-color 0.2s ease, box-shadow 0.2s ease",
//       }}
//       styles={{
//         root: {
//           "&:hover": {
//             borderColor: "rgba(255,255,255,0.12)",
//             boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
//           },
//         },
//       }}
//     >
//       <Stack gap="sm">
//         {/* Prompt */}
//         <Group justify="space-between" align="flex-start" wrap="nowrap">
//           <Text
//             size="sm"
//             fw={600}
//             style={{
//               color: "black",
//               lineHeight: 1.45,
//               flex: 1,
//             }}
//           >
//             {prompt}
//           </Text>

//           <Tooltip label={copied ? "Copied!" : "Copy response"} withArrow position="left">
//             <ActionIcon
//               size="sm"
//               variant="subtle"
//               color={copied ? "teal" : "gray"}
//               onClick={handleCopy}
//               style={{ flexShrink: 0, transition: "color 0.15s" }}
//             >
//               <CopyIcon />
//             </ActionIcon>
//           </Tooltip>
//         </Group>

//         <Divider size="xs" style={{ opacity: 0.08 }} />

//         {/* Response */}
//         <Text
//           size="xs"
//           style={{
//             color: "black",
//             lineHeight: 1.7,
//             whiteSpace: "pre-wrap",
//           }}
//         >
//           {displayText}
//         </Text>

//         {isLong && (
//           <Button
//             variant="subtle"
//             size="compact-xs"
//             color="gray"
//             style={{ width: "fit-content", fontSize: 11, opacity: 0.7 }}
//             onClick={() => setExpanded(!expanded)}
//           >
//             {expanded ? "Show less" : "Read more"}
//           </Button>
//         )}

//         {/* Meta */}
//         <Group gap="sm" align="center" mt={4}>
//           <Badge
//             size="xs"
//             variant="dot"
//             color="blue"
//             radius="sm"
//             style={{ textTransform: "none", letterSpacing: 0.2, fontSize: 10 }}
//           >
//             {item.model}
//           </Badge>

//           <Group gap={4} align="center">
//             <Box c="dimmed" style={{ display: "flex" }}>
//               <ClockIcon />
//             </Box>
//             <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
//               {formatDate(item.timestamp)}
//             </Text>
//           </Group>

//           {item.generation_time_ms && (
//             <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
//               {item.generation_time_ms} ms
//             </Text>
//           )}
//         </Group>
//       </Stack>
//     </Paper>
//   )
// }

/*Main Component*/

export default function History() {
  const navigate = useNavigate()
  const isMobile = useMediaQuery("(max-width: 600px)")
  const isTablet = useMediaQuery("(max-width: 900px)")

  const [imageHistory, setImageHistory] = useState<PromptGroup[]>([])
  const [textHistory, setTextHistory] = useState<TextRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<ImageRecord | null>(null)
  const [activeTab, setActiveTab] = useState<string | null>("images")
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchTextHistory = useCallback((range: [Date | null, Date | null], pageNum: number) => {
    setLoading(true)

    const headers = {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json",
    }

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

    axios
      .get(`${backendUrl}/text/history`, { headers, params })
      .then(res => {
        setTextHistory(res.data.history || [])
        setTotalPages(res.data.total_pages || 1)
        setLoading(false)
      })
      .catch(err => {
        console.error("Failed to fetch text history:", err)
        setLoading(false)
      })
  }, [])

  const fetchImagesHistory = useCallback((range: [Date | null, Date | null], pageNum: number) => {
    setLoading(true)

    const headers = {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json",
    }
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

    Promise.all([axios.get(`${backendUrl}/images/history`, { headers, params }), ,])
      .then(([imgRes, txtRes]) => {
        const groups: { [prompt: string]: ImageRecord[] } = {}
        ;(imgRes.data.history || []).forEach((item: ImageRecord) => {
          if (!groups[item.prompt]) groups[item.prompt] = []
          groups[item.prompt].push(item)
        })
        setImageHistory(Object.keys(groups).map(prompt => ({ prompt, images: groups[prompt] })))
        setTotalPages(imgRes.data.total_pages || 1)
        setLoading(false)
      })
      .catch(err => {
        console.error("Failed to fetch history:", err)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (activeTab === "images") {
      fetchImagesHistory(dateRange, page)
    } else if (activeTab === "text") {
      fetchTextHistory(dateRange, page)
    }
  }, [activeTab, dateRange, page])

  const columns = isMobile ? 2 : isTablet ? 3 : 4
  const totalImages = imageHistory.reduce((acc, g) => acc + g.images.length, 0)

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

        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          variant="default"
          styles={{
            root: { borderBottom: "none" },
            list: {
              borderBottom: "none",
              gap: 2,
            },
            tab: {
              fontSize: 13,
              fontWeight: 500,
              color: "rgba(5, 5, 5, 0.75)",
              padding: "10px 18px",
              borderRadius: rem(10),
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              border: "1px solid transparent",
              borderBottom: "none",
              marginBottom: -1,
              transition: "all 0.2s ease",
              "&[dataActive]": {
                color: "black",
                background: "rgba(255,255,255,0.05)",
                borderColor: "rgba(255,255,255,0.08)",
                borderBottomColor: "transparent",
              },
              "&:hover:not([dataActive])": {
                color: "black",
                background: "rgba(255,255,255,0.02)",
              },
            },
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="images" leftSection={<ImageIcon />}>
              Images
              {totalImages > 0 && (
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
                  {totalImages}
                </Badge>
              )}
            </Tabs.Tab>

            <Tabs.Tab value="text" leftSection={<TextIcon />}>
              Text
              {textHistory.length > 0 && (
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
                  {textHistory.length}
                </Badge>
              )}
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Box>
      {/* Date range picker */}
      <Box px={isMobile ? 0 : 40} py={isMobile ? 20 : 36}>
        <Group justify="space-between" align="center" wrap="nowrap">
          <DateRangePicker
            dateRange={dateRange}
            setDateRange={range => {
              setDateRange(range)
              setPage(1) // reset to first page on new filter
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
                      {group.images.filter(Boolean).map((item, i) => (
                        <ImageCard key={i} item={item} onClick={() => setSelectedImage(item)} />
                      ))}
                    </SimpleGrid>
                  </Stack>
                ))}
                {totalPages > 1 && (
                  <Group justify="center" mt="md">
                    <Pagination
                      total={totalPages}
                      value={page}
                      onChange={newPage => {
                        setPage(newPage)
                        window.scrollTo({ top: 0, behavior: "smooth" })
                      }}
                    />
                  </Group>
                )}
              </Stack>
            </ScrollArea>
          )
        ) : textHistory.length === 0 ? (
          <EmptyState label="No text history yet. Start a conversation to see responses here." />
        ) : (
          <ScrollArea>
            <Stack gap={12}>
              {textHistory.map((item, idx) => (
                <Transition key={idx} mounted transition="fade" duration={200}>
                  {styles => (
                    <div style={{ ...styles, animationDelay: `${idx * 30}ms` }}>
                      <TextCard item={item} />
                    </div>
                  )}
                </Transition>
              ))}
              <Group justify="center" mt="md">
                <Pagination
                  total={totalPages}
                  value={page}
                  onChange={newPage => {
                    setPage(newPage)
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }}
                />
              </Group>
            </Stack>
          </ScrollArea>
        )}
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
                src={`data:image/${selectedImage.image_type || "png"};base64,${selectedImage.image_data}`}
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
                    link.href = `data:image/${selectedImage.image_type || "png"};base64,${selectedImage.image_data}`
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
