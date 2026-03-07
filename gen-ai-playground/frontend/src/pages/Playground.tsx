import { useState, type ReactNode } from "react"
import ImageGenerator from "../components/ImageGenerator"
import ImageEditor from "../components/ImageEditor"
import TextGenerator from "../components/TextGenerator"
import { Select, Group } from "@mantine/core"
import { useAuth } from "../context/AuthContext"

/**
 * @returns playground page where you can choose whether to create or edit an image using AI models
 */
export default function Playground() {
  const { checkToken } = useAuth()
  const tabs = ["ImageGenerator", "ImageEditor", "TextGenerator"] as const
  type Tab = (typeof tabs)[number]

  const [selectedComponent, setSelectedComponent] = useState<Tab>("ImageGenerator")

  const componentsMap: Record<Tab, ReactNode> = {
    ImageGenerator: <ImageGenerator />,
    ImageEditor: <ImageEditor />,
    TextGenerator: <TextGenerator />,
  }

  return (
    <>
      <Group gap="md" p="md">
        <Select
          label="Select playground component"
          data={tabs.map((tab) => ({ value: tab, label: tab }))}
          value={selectedComponent}
          onChange={(value) => {
            if (!checkToken()) return
            if (value) setSelectedComponent(value as Tab)
          }}
          data-testid="playground-select"
        />
      </Group>

      <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
        <div style={{ width: "100%", maxWidth: 1100, padding: "0 16px" }}>
          {componentsMap[selectedComponent]}
        </div>
      </div>
    </>
  )
}
