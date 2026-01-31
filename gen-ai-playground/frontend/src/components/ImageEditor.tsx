import { useState, useTransition } from "react"
import { PromptTextBox } from "./PromtTextBox"
import axios from "axios"


/**
 * 
 * @returns tab where you can enter an image and prompt and use an AI model to edit the image
 */


export default function ImageEditor() {
    const [prompt, setPrompt] = useState("")
    const backendUrl = import.meta.env.VITE_API_URL;
    const [userImage, setUserImage] = useState<File | null>(null)
    const [userImageBase64, setUserImageBase64] = useState<string | null>(null)
    const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null)
    const [selectedModel, setSelectedModel] = useState<string>("")
    const models = ["FLUX.1_Kontext_dev", ]
    async function EditUserImage(prompt: string) {

        if (!userImage || !prompt || selectedModel === "") {
            alert("Please provide an image, a prompt, and select a model")
        } else {
            imageToBase64(userImage);
        }
        if (!userImageBase64) {
            alert("Error converting image to base64")
            return
        }
        try {
            const formData = new FormData();
            formData.append("image", userImageBase64);
            formData.append("prompt", prompt);
            let promises = []
            if (selectedModel) {
                promises.push(
                    axios.post(`${backendUrl}/edit-image`, {
                        image: userImageBase64,
                        prompt: prompt,
                        model: selectedModel
                    }, {
                        responseType: 'blob'
                    })
                )
            }
            // maybe later add more models here
            const responses = await Promise.all(promises);
            
            if (responses.length > 0) {
                const editedImageBlob = responses[0].data;
                const editedImageObjectUrl = URL.createObjectURL(editedImageBlob);
                setEditedImageUrl(editedImageObjectUrl);
            }else{
                console.error(" No responses received from the server")
            }


        } catch (error) {
            console.error("Error editing image:", error);
        }

    }

    //convert users image file to base64
    const imageToBase64 = (file: File) => {
        if (!file) return
        const reader = new FileReader()
        reader.onloadend = () => {
            setUserImageBase64(reader.result as string)
        }
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

        </>
    )
}