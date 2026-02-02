import { useState } from "react"
import { PromptTextBox } from "./PromtTextBox"
import axios from "axios"
import PhotoArea from "./PhotoArea"


/**
 * 
 * @returns tab where you can enter an image and prompt and use an AI model to edit the image
 */


export default function ImageEditor() {
    const [prompt, setPrompt] = useState("")
    const backendUrl = import.meta.env.VITE_API_URL
    const [userImage, setUserImage] = useState<File | null>(null)
    const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null)
    const [selectedModel, setSelectedModel] = useState<string>("")
    const models = ["FLUX.1_Kontext_dev",]
    const [isLoading, setIsLoading] = useState(false)

    async function EditUserImage(prompt: string) {

        if (!userImage || !prompt || selectedModel === "") {
            alert("Please provide an image, a prompt, and select a model")
            return
        }
        setIsLoading(true)
        try {
            const base64Image = await imageToBase64(userImage)
            console.log(base64Image)
            let promises = []
            if (selectedModel) {
                promises.push(
                    axios.post(`${backendUrl}/images/edit-image`, {
                        image: base64Image,
                        prompt: prompt,
                        model: selectedModel
                    }, {
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
                {models.map((model) => (
                    <label key={model} className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="model"
                            checked={selectedModel === model}
                            onChange={() => setSelectedModel(model)}
                            className="w-4 h-4"
                        />
                        <span>{model}</span>
                    </label>
                ))}
                <input type="file" accept="image/*" onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                        setUserImage(e.target.files[0])
                    }
                }}
                >
                </input>
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
                {isLoading && <p>Editing image...</p>}
                {editedImageUrl === null && !isLoading && <p>Edited image will appear here</p>}
                <PhotoArea src={editedImageUrl} alt="Edited image" />
            </div>

        </>
    )
}