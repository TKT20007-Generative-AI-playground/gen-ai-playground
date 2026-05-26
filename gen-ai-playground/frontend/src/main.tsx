import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App.tsx"
import {
  ColorSchemeScript,
  MantineProvider,
  createTheme,
  localStorageColorSchemeManager,
} from "@mantine/core"
import { Notifications } from "@mantine/notifications"
import "@mantine/core/styles.css"
import "@mantine/dates/styles.css"
import "@mantine/carousel/styles.css"
import "@mantine/notifications/styles.css"
import "./styles/index.css"
import { AuthProvider } from "./context/AuthProvider"

const theme = createTheme({
  fontFamily: "'Inter', -apple-system,  sans-serif",
  headings: {
    fontFamily: "'Inter', sans-serif",
    fontWeight: "700",
  },
  components: {
    Select: {
      styles: {
        input: { fontSize: 16 },
      },
    },
  },
})

const colorSchemeManager = localStorageColorSchemeManager({ key: "mantine-color-scheme" })

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ColorSchemeScript defaultColorScheme="light" />
    <MantineProvider
      theme={theme}
      defaultColorScheme="light"
      colorSchemeManager={colorSchemeManager}
    >
      <Notifications
        position="top-right"
        classNames={{ root: "notifications-root", notification: "notifications-notification" }}
      />
      <AuthProvider>
        <App />
      </AuthProvider>
    </MantineProvider>
  </StrictMode>,
)
