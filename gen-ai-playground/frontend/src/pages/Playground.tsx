import { useState } from "react"
import ImageGenerator from "../components/ImageGenerator"
import ImageEditor from "../components/ImageEditor"
import { Select, Text, Group } from '@mantine/core';
/**
 * 
 * @returns playground page where you can choose whether to create or edit an image using AI models
 */
export default function Playground() {

    const tabs = ["ImageGenerator", "ImageEditor"]
    const [selectedComponent, setSelectedComponent] = useState<string | null>("ImageGenerator")
    const selectPlayingComponent = (componentName: string) => {
        setSelectedComponent(componentName)
    }
    const componentsMap: Record<string, React.ReactNode> = {
        ImageGenerator: <ImageGenerator />,
        ImageEditor: <ImageEditor />,
    }



    return (
        <>
            {/* <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", width: "100%", alignItems: "center" }}> */}
            <Group
                justify="center"
            >
                <Select
                    label="Select playground component"
                    data={tabs.map(tab => ({ value: tab, label: tab }))}
                    value={selectedComponent}
                    onChange={(value: string | null) => selectPlayingComponent(value || "")}
                />
                {/* <h2>Welcome to the Gen AI Playground!</h2> */}
                <Text
                    fw={500}

                > Welcome to the Gen AI Playground!
                </Text>
            </Group>
            {/* </div> */}
            < div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", alignItems: "center" }
            }>
                <div>
                    {selectedComponent && componentsMap[selectedComponent]}
                </div>
            </div >
        </>
    )
}
