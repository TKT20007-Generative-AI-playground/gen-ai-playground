import { useState, type ReactNode } from "react"
import ImageGenerator from "../components/ImageGenerator"
import ImageEditor from "../components/ImageEditor"
import { Select, Group } from "@mantine/core"

/**
 * @returns playground page where you can choose whether to create or edit an image using AI models
 */
export default function Playground() {
  const tabs = ["ImageGenerator", "ImageEditor"] as const
  type Tab = (typeof tabs)[number]

  const [selectedComponent, setSelectedComponent] = useState<Tab>("ImageGenerator")

  const componentsMap: Record<Tab, ReactNode> = {
    ImageGenerator: <ImageGenerator />,
    ImageEditor: <ImageEditor />,
  }

  return (
    <>
      <Group gap="md" p="md">
        <Select
          label="Select playground component"
          data={tabs.map((tab) => ({ value: tab, label: tab }))}
          value={selectedComponent}
          onChange={(value) => {
            if (value) setSelectedComponent(value as Tab)
          }}
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
