
import { useEffect, useState, type ReactNode } from "react";
import ImageGenerator from "../components/ImageGenerator";
import ImageEditor from "../components/ImageEditor";
import TextGenerator from "../components/TextGenerator";
import { Select, Group } from "@mantine/core";
import { useNavigate, useParams } from "react-router-dom";

/**
 * @returns playground page where you can choose whether to create or edit an image using AI models
 */
export default function Playground() {
  const navigate = useNavigate();
  const tabs = ["ImageGenerator", "ImageEditor", "TextGenerator"] as const;
  type Tab = (typeof tabs)[number];

  const { tab } = useParams();
  

    const [selectedComponent, setSelectedComponent] = useState<Tab>(() => {
    if (tab && tabs.includes(tab as Tab)) return tab as Tab;
    return "ImageGenerator";
    });

  //  Sync state with URL param
  useEffect(() => {
    if (tab && tabs.includes(tab as Tab)) {
      setSelectedComponent(tab as Tab);
    }
  }, [tab]);

  const componentsMap: Record<Tab, ReactNode> = {
    ImageGenerator: <ImageGenerator />,
    ImageEditor: <ImageEditor />,
    TextGenerator: <TextGenerator />,
  };

  return (
    <>
      <Group gap="md" p="md">
        <Select
          label="Select playground component"
          data={tabs.map((tab) => ({ value: tab, label: tab }))}
          value={selectedComponent}
          onChange={(value) => {
            if (value) navigate(`/playground/${value}`);
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
  );
}
