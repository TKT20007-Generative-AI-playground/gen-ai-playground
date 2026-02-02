import { useState } from "react"
import ImageGenerator from "../components/ImageGenerator"
import ImageEditor from "../components/ImageEditor"

/**
 * 
 * @returns playground page where you can choose whether to create or edit an image using AI models
 */
export default function Playground() {

    const tabs = ["ImageGenerator", "ImageEditor"]
    const [selectedComponent, setSelectedComponent] = useState<string | null>(null)
    const selectPlayingComponent = (componentName: string) => {
        setSelectedComponent(componentName)
    }
    const componentsMap: Record<string, React.ReactNode> = {
        ImageGenerator: <ImageGenerator />,
        ImageEditor: <ImageEditor />,
    }


    return (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", alignItems: "center" }}>
            <h2>Welcome to the Gen AI Playground!</h2>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px" }}>
                {tabs.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => selectPlayingComponent(tab)}
                        style={{ margin: "10px", display: "flex", padding: "10px", backgroundColor: selectedComponent === tab ? "#007bff" : "#f8f9fa", color: selectedComponent === tab ? "white" : "black", border: "1px solid #dee2e6", borderRadius: "5px" }}
                    >
                        {tab}
                    </button>
                ))}
            </div>
            <div>
                {selectedComponent && componentsMap[selectedComponent]}
            </div>
        </div>
    )
}
