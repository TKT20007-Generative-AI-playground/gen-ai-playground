import { useLocation, useNavigate, useParams } from "react-router-dom"
import { Select, Group } from "@mantine/core"
// import { useEffect } from "react"
import type { ReactNode } from "react"

import ImageGenerator from "../components/ImageGenerator"
import ImageEditor from "../components/ImageEditor"
import TextGenerator from "../components/TextGenerator"
import Transcribe from "../components/Transcribe"
import { PLAYGROUND_TABS } from "../constants/tabs"
import NotFoundPage from "./PageNotFound"

type Tab = (typeof PLAYGROUND_TABS)[number]

export default function Playground({ historyOpen }: { historyOpen: boolean }) {
  const { tab } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const imageToEdit = location.state?.imageToEdit || null

  const selectedComponent: Tab =
    tab && PLAYGROUND_TABS.includes(tab as Tab) ? (tab as Tab) : "ImageGenerator"

  const componentsMap: Record<Tab, ReactNode> = {
    ImageGenerator: <ImageGenerator />,
    ImageEditor: <ImageEditor imageToEdit={imageToEdit} />,
    TextGenerator: <TextGenerator opened={historyOpen} />,
    Transcribe: <Transcribe />,
  }

  // If tab is invalid, redirect to default
  if (!tab || !PLAYGROUND_TABS.includes(tab as Tab)) {
    return <NotFoundPage />
  }

  return (
    <>
      <Group gap="md" p="md">
        <Select
          label="Select playground component"
          data={PLAYGROUND_TABS.map((t) => ({ value: t, label: t }))}
          value={selectedComponent}
          onChange={value => {
            if (value) navigate(`/playground/${value}`)
          }}
          data-testid="playground-select"
          searchable
        />
      </Group>

      <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
        <div style={{ width: "100%", maxWidth: 1100, padding: "0 16px 24px" }}>
          {componentsMap[selectedComponent]}
        </div>
      </div>
    </>
  )
}
