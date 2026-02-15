import axios from "axios"
import { useAuth } from "../context/AuthContext"

import {
    Button
} from '@mantine/core'

export default function TextGenerator() {
    const { isLoggedIn } = useAuth()
    const backendUrl = import.meta.env.VITE_API_URL

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

    async function DeployContainer() {
        try {
            const token = localStorage.getItem("token");

            if (!token) {
                throw new Error("Token puuttuu");
            }

            const getStatusResponse = await axios.get(`${backendUrl}/text/status`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            const containerStatus = getStatusResponse.data.status;

            if (containerStatus !== "no_deployment") {
                console.log("Already connected to deployment with status:", containerStatus);
                return getStatusResponse.data;
            }

            const getDeployments = await axios.get(`${backendUrl}/text/deployments`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            if (getDeployments.data && getDeployments.data.length > 0) {
                const existingContainer = getDeployments.data[0];
                console.log("Found existing container:", existingContainer.name);
                
                const connectResponse = await axios.post(`${backendUrl}/text/connect`, 
                    {
                        deployment_name: existingContainer.name,
                        model_path: "deepseek-ai/deepseek-llm-7b-chat"
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json"
                        }
                    }
                );
                
                console.log("Connected to existing container:", connectResponse.data);
                return connectResponse.data;
            }

            // No existing deployments anywhere, create a new one
            console.log("No existing deployments found, creating new one...");
            const response = await axios.post(`${backendUrl}/text/deploy`, {}, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });
            console.log("Created new deployment:", response.data);
            return response.data;

        } catch (error) {
            console.error("Virhe:", error);
        }
    }

    async function DeleteContainer() {

        try {
            const token = localStorage.getItem("token");

            if (!token) {
                throw new Error("Token puuttuu");
            }

            const response = await axios.delete(`${backendUrl}/text/deploy`, {
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

    async function CheckContainerStatus() {

        try {
            const token = localStorage.getItem("token");

            if (!token) {
                throw new Error("Token puuttuu");
            }

            const response = await axios.get(`${backendUrl}/text/status`, {
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
                <Button variant="filled" onClick={DeployContainer}>Deploy Container</Button>
                <Button variant="filled" onClick={CheckContainerStatus}>Check Container Status</Button>
                <Button variant="filled" onClick={DeleteContainer} color="red">Delete Container</Button>
            </div>

            
        </>
    )
}