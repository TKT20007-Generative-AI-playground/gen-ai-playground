import { useCallback, useEffect, useState } from "react"
import axios from "axios"
import { useNavigate } from "react-router-dom"
import type { ImageRecord, PromptGroup, TextRecord } from "./history-ui/historyInterfaces"
import DateRangePicker from "./history-ui/DateRangePicker"
import ImageCard from "./history-ui/ImageCard"
import TextCard from "./history-ui/TextCard"
import EmptyState from "./history-ui/EmptyState"
import { TextIcon, ImageIcon, DownloadIcon, EditIcon } from "./history-ui/Icons"
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
  Box,
  ActionIcon,
  Tooltip,
  Transition,
  SimpleGrid,
  rem,
  Pagination,
} from "@mantine/core"
import { useMediaQuery } from "@mantine/hooks"
import { EDIT_MODELS } from "../constants/models"

export default function History() {
  const backendUrl = import.meta.env.VITE_API_URL
  const navigate = useNavigate()
  const isMobile = useMediaQuery("(max-width: 600px)")
  const isTablet = useMediaQuery("(max-width: 900px)")

  const [imageHistory, setImageHistory] = useState<PromptGroup[]>([])
  const [textHistory, setTextHistory] = useState<TextRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<ImageRecord | null>(null)

  type Tab = "images" | "text"
  const [activeTab, setActiveTab] = useState<Tab>("images")
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null])

  const [pages, setPages] = useState<Record<Tab, number>>({
    images: 1,
    text: 1,
  })
  const [totalPages, setTotalPages] = useState<Record<Tab, number>>({
    images: 1,
    text: 1,
  })
  const currentPage = pages[activeTab]

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

  const fetchTextHistory = useCallback(
    (range: [Date | null, Date | null], pageNum: number) => {
      setLoading(true)

      const headers = {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        "Content-Type": "application/json",
      }

      const params = buildParams(range, pageNum)

      axios
        .get(`${backendUrl}/text/history`, { headers, params })
        .then(res => {
          setTextHistory(res.data.history || [])
          setTotalPages(prev => ({ ...prev, text: res.data.total_pages || 1 }))
        })
        .catch(err => {
          console.error("Failed to fetch text history:", err)
        })
        .finally(() => {
          setLoading(false)
        })
    },
    [backendUrl],
  )

  const fetchImagesHistory = useCallback(
    (range: [Date | null, Date | null], pageNum: number) => {
      setLoading(true)

      const headers = {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        "Content-Type": "application/json",
      }
      const params = buildParams(range, pageNum)

      axios
        .get(`${backendUrl}/images/history`, { headers, params })
        .then(imgRes => {
          const groups: { [prompt: string]: ImageRecord[] } = {}
          ;(imgRes.data.history || []).forEach((item: ImageRecord) => {
            if (!groups[item.prompt]) groups[item.prompt] = []
            groups[item.prompt].push(item)
          })
          setImageHistory(Object.keys(groups).map(prompt => ({ prompt, images: groups[prompt] })))
          setTotalPages(prev => ({ ...prev, images: imgRes.data.total_pages || 1 }))
        })
        .catch(err => {
          console.error("Failed to fetch history:", err)
        })
        .finally(() => {
          setLoading(false)
        })
    },
    [backendUrl],
  )

  useEffect(() => {
    if (activeTab === "images") {
      fetchImagesHistory(dateRange, currentPage)
    } else {
      fetchTextHistory(dateRange, currentPage)
    }
  }, [activeTab, dateRange, pages, fetchImagesHistory, fetchTextHistory])

  useEffect(() => {
    setPages(prev => ({
      ...prev,
      [activeTab]: 1,
    }))
  }, [dateRange])

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
          onChange={value => setActiveTab(value as Tab)}
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
              setPages(prev => ({ ...prev, [activeTab]: 1 }))
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
