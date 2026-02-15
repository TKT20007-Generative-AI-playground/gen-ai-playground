import { useState } from "react"
import { PromptTextBox } from "./PromtTextBox"
import axios from "axios"
import { useAuth } from "../context/AuthContext"

import {
    MultiSelect,
    Loader,
    Card,
    Image,
    Text,
    FileButton,
    Button,
    Stack,
    Tooltip,
    SimpleGrid
} from '@mantine/core'

/**
 * 
 * @returns tab where you can enter an image and prompt and use an AI model to edit the image
 */


export default function TextGenerator() {
    const { isLoggedIn } = useAuth()
    const [prompt, setPrompt] = useState("")
    const backendUrl = import.meta.env.VITE_API_URL
    const [userImage, setUserImage] = useState<File | null>(null)
    const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null)
    const [selectedModels, setSelectedModels] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const models = [
        "FLUX1_KONTEXT_DEV",
        "FLUX2_KLEIN_9B",
        "FLUX2_KLEIN_4B"
    ]

    if (!isLoggedIn) {
        return (
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    textAlign: "center",
                    padding: 40,
                }}
            >
                <p>You must be logged in to generate images.</p>
            </div>
        )
    }
    async function EditUserImage(prompt: string) {

        try {
            const token = localStorage.getItem("token");

            if (!token) {
                throw new Error("Token puuttuu");
            }

            const response = await axios.post(`${backendUrl}/text/deploy`, {
                model_path: "deepseek-ai/deepseek-llm-7b-chat"
            }, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            console.log(response.data);
            return response.data;

        } catch (error) {
            console.error("Virhe:", error);
        }

    }
    return (
        <>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", alignItems: "center", margin: "10px" }}>
                
                <PromptTextBox onSubmit={EditUserImage}
                    value={prompt}
                    onChange={setPrompt}
                    usage="Edit image" />
                <p>prompt: {prompt}</p>
            </div>
            
        </>
    )
}