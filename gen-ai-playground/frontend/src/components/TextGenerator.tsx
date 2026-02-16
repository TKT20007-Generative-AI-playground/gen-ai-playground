import axios from "axios"
import { useAuth } from "../context/AuthContext"
import { useState } from "react"

import {
    Button,
    MultiSelect
} from '@mantine/core'

type ModelOption = {
    value: string
    label: string
    slug: string
}

const modelOptions: ModelOption[] = [
    {
        value: "deepseek-llm-7b",
        label: "DeepSeek LLM 7B",
        slug: "deepseek-llm-7b-chat"
    },
    {
        value: "Qwen3-8B",
        label: "Qwen 3 8B",
        slug: "qwen3-8b"
    },
    {
        value: "Llama-3.1-8B", // Visit https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct to ask for access.
        label: "Llama 3.1 8B",
        slug: "llama-3.1-8b-instruct"
    }
]

export default function TextGenerator() {
    const { isLoggedIn } = useAuth()
    const backendUrl = import.meta.env.VITE_API_URL
    const [selectedModel, setSelectedModel] = useState<string | null>(null)
    const [prompt, setPrompt] = useState("What is the capital of Finland?")
    const [generatedText, setGeneratedText] = useState("")

    const getAuthHeaders = () => {
        const token = localStorage.getItem("token")
        if (!token) {
            throw new Error("Token puuttuu")
        }

        return {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        }
    }

    const findSelectedModel = () =>
        modelOptions.find((model) => model.value === selectedModel) ?? null

    const DeployContainer = async () => {
        if (!selectedModel) {
            console.warn("Model not selected")
            return
        }

        const selected = findSelectedModel()
        if (!selected) {
            console.warn("Selected model definition missing")
            return
        }

        console.log("Deploying container with model:", selectedModel)

        try {
            const deploymentsResponse = await axios.get(
                `${backendUrl}/text/deployments`,
                {
                    headers: getAuthHeaders()
                }
            )

            const deployments = deploymentsResponse.data || []
            console.log("Existing deployments:", deployments)

            const existingContainer = deployments.find(
                (d: any) => {
                    const name = typeof d?.name === "string" ? d.name.toLowerCase() : ""
                    return name.includes(selected.slug.toLowerCase())
                }
            )

            if (existingContainer) {
                console.log("Found existing container for model:", existingContainer.name)

                const connectResponse = await axios.post(
                    `${backendUrl}/text/connect`,
                    {
                        deployment_name: existingContainer.name,
                        model_path: selectedModel
                    },
                    {
                        headers: getAuthHeaders()
                    }
                )

                console.log("Connected to existing container:", connectResponse.data)
                return connectResponse.data
            }

            console.log("No deployment found for model, creating new one...")

            const response = await axios.post(
                `${backendUrl}/text/deploy`,
                {
                    model_path: selectedModel
                },
                {
                    headers: getAuthHeaders()
                }
            )

            console.log("Created new deployment:", response.data)
            return response.data
        } catch (error) {
            console.error("Virhe:", error)
        }
    }

    const DeleteContainer = async () => {

        try {
            const response = await axios.delete(`${backendUrl}/text/deploy`, {
                headers: getAuthHeaders()
            });

            console.log(response.data);
            return response.data;

        } catch (error) {
            console.error("Virhe:", error);
        }

    }

    const CheckContainerStatus = async () => {

        try {
            const response = await axios.get(`${backendUrl}/text/status`, {
                headers: getAuthHeaders()
            });

            console.log(response.data);
            return response.data;

        } catch (error) {
            console.error("Virhe:", error);
        }

    }

    const GenerateText = async (prompt: string) => {

        if (!selectedModel) {
            console.warn("Model not selected")
            return
        }

        const selected = findSelectedModel()
        if (!selected) {
            console.warn("Selected model definition missing")
            return
        }

        try {
            // Ensure backend is connected to a deployment before generating
            const deploymentsResponse = await axios.get(
                `${backendUrl}/text/deployments`,
                { headers: getAuthHeaders() }
            )
            const deployments = deploymentsResponse.data || []
            const existingContainer = deployments.find(
                (d: any) => {
                    const name = typeof d?.name === "string" ? d.name.toLowerCase() : ""
                    return name.includes(selected.slug.toLowerCase())
                }
            )

            if (existingContainer) {
                // Connect backend to the running deployment so it knows which container to use
                await axios.post(
                    `${backendUrl}/text/connect`,
                    {
                        deployment_name: existingContainer.name,
                        model_path: selectedModel
                    },
                    { headers: getAuthHeaders() }
                )
                console.log("Connected to deployment before generating:", existingContainer.name)
            } else {
                console.error("No running deployment found for model:", selectedModel)
                return
            }

            const response = await axios.post(
                `${backendUrl}/text/generate`,
                {
                    prompt: prompt,
                    max_tokens: 256,
                    temperature: 0.7,
                    top_p: 0.9
                },
                {
                    headers: getAuthHeaders()
                }
            )
            console.log("Generated text:", response.data)
            setGeneratedText(response.data.generated_text)
        } catch (error) {
            console.error("Error generating text:", error)
        }
    }

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
                <p>You must be logged in to generate text.</p>
            </div>
        )
    }

    return (
        <>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", alignItems: "center", margin: "10px" }}>
                <MultiSelect
                    label="Select model for text generation"
                    placeholder="Select model"
                    data={modelOptions}
                    maxValues={1}
                    value={selectedModel ? [selectedModel] : []}
                    onChange={(value) => setSelectedModel(value[0] ?? null)}
                />
                <Button variant="filled" onClick={DeployContainer} disabled={!selectedModel}>Deploy Container</Button>
                <Button variant="filled" onClick={CheckContainerStatus}>Check Container Status</Button>
                <Button variant="filled" onClick={DeleteContainer} color="red">Delete Container</Button>
                <Button variant="filled" onClick={() => GenerateText(prompt)} disabled={!selectedModel}>Generate Text</Button>
            </div>
            <div>
                <h3>Prompt:</h3>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    cols={50}
                />
            </div>
            <div>
                <h3>Generated Text:</h3>
                <p>{generatedText}</p>
            </div>
        </>
    )
}