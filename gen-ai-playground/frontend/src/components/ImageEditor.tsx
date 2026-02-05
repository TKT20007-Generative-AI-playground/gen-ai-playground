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
    Grid
} from '@mantine/core';

/**
 * 
 * @returns tab where you can enter an image and prompt and use an AI model to edit the image
 */


export default function ImageEditor() {
    const { isLoggedIn } = useAuth()
    const [prompt, setPrompt] = useState("")
    const backendUrl = import.meta.env.VITE_API_URL
    const [userImage, setUserImage] = useState<File | null>(null)
    const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null)
    const [selectedModels, setSelectedModels] = useState<string[]>([])
    const models = ["FLUX.1_Kontext_dev",]
    const [isLoading, setIsLoading] = useState(false)

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

        if (!userImage || !prompt || selectedModels.length === 0) {
            alert("Please provide an image, a prompt, and select a model")
            return
        }
        setIsLoading(true)
        try {
            const base64Image = await imageToBase64(userImage)
            console.log(base64Image)
            let promises = []
            if (selectedModels[0]) {
                promises.push(
                    axios.post(`${backendUrl}/images/edit-image`, {
                        image: base64Image,
                        prompt: prompt,
                        model: selectedModels[0]
                    }, {
                        headers: {
                            Authorization: `Bearer ${localStorage.getItem("token")}`,
                            "Content-Type": "application/json"
                        },
                        responseType: 'blob'
                    })
                )
            }

            // maybe later add more models here
            const responses = await Promise.all(promises)
            console.log(responses[0])

            if (responses.length > 0) {
                const editedImageBlob = responses[0].data
                const editedImageObjectUrl = URL.createObjectURL(editedImageBlob);
                setEditedImageUrl(editedImageObjectUrl)
                console.log(editedImageObjectUrl)
            } else {
                console.error(" No responses received from the server")
            }
        } catch (error) {
            console.error("Error editing image:", error)
        } finally {
            setIsLoading(false)
        }
    }

    //convert users image file to base64
    const imageToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            if (!file) return reject("No file provided")
            const reader = new FileReader()
            reader.onloadend = () => {
                if (reader.result) {
                    resolve(reader.result as string)
                } else {
                    reject("Failed to convert")
                }
            }
            reader.onerror = () => reject("Failed to read file")
            reader.readAsDataURL(file)
        })
    }



    return (
        <>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", alignItems: "center", margin: "10px" }}>
                <Stack spacing="md">
                    <MultiSelect
                        label="Select model to edit image with"
                        placeholder="Select model"
                        data={models}
                        maxValues={1}
                        onChange={setSelectedModels}
                    />
                    <FileButton
                        onChange={setUserImage}
                        accept="image/png,image/jpeg"
                        value={userImage}
                        label="Upload image"
                    >
                        {(props: File) =>
                            <Tooltip label="Select an image to edit">
                                <Button {...props}>{userImage ? "Change image" : "Upload image"}</Button>
                            </Tooltip>
                        }
                    </FileButton>

                    <Text>
                        {userImage ? `Selected image: ${userImage.name}` : "No image selected"}
                    </Text>
                </Stack>
                <PromptTextBox onSubmit={EditUserImage}
                    value={prompt}
                    onChange={setPrompt}
                    usage="Edit image" />
                <p>prompt: {prompt}</p>
            </div>
            <div style={{
                display: "flex",
                justifyContent: "center",

            }}>
                {isLoading && <><p>Editing image...</p><Loader /></>}
                {editedImageUrl === null && !isLoading && <p>Edited image will appear here</p>}
                <Grid justify="center">
                    <Grid.Col span={6}>
                        {editedImageUrl &&
                            <Card shadow="sm" padding="lg" radius="md" withBorder>
                                <Text weight={500} size="lg" mb="md">Model used: {selectedModels[0]}</Text>
                                <Image
                                    src={editedImageUrl}
                                    alt="Edited image"
                                    height={400}
                                />
                            </Card>
                        }
                    </Grid.Col>
                    <Grid.Col span={6}>
                        {editedImageUrl &&
                            <Card shadow="sm" padding="lg" radius="md" withBorder>
                                <Text weight={500} size="lg" mb="md">Model used: {selectedModels[0]}</Text>
                                <Image
                                    src={editedImageUrl}
                                    alt="Edited image"
                                    height={400}
                                />
                            </Card>
                        }
                    </Grid.Col>
                </Grid>
            </div>
        </>
    )
}