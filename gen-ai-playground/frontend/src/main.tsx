import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from "./App.tsx"
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import { AuthProvider } from './context/AuthContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="light">
      <AuthProvider>
        <App />
      </AuthProvider>
    </MantineProvider>
  </StrictMode>,
)
