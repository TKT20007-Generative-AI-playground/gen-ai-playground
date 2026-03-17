import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App.tsx"
import { MantineProvider, createTheme } from "@mantine/core"
import "@mantine/core/styles.css"
import "@mantine/dates/styles.css"
import { AuthProvider } from "./context/AuthProvider"

const theme = createTheme({
  fontFamily: "'Inter', -apple-system,  sans-serif",
  headings: {
    fontFamily: "'Inter', sans-serif",
    fontWeight: "700",
  },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <AuthProvider>
        <App />
      </AuthProvider>
    </MantineProvider>
  </StrictMode>,
)
