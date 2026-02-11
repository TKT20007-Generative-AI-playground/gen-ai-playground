import { Link } from "react-router-dom"
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import LoginModal from './Login'
import { Group, Divider, Text, Button } from "@mantine/core"

export default function Header() {
  const [loginOpened, setLoginOpened] = useState(false)
  const { isLoggedIn, logout } = useAuth()

  return (
    <>
      <Group justify="space-between" p="md" bg="#2C4E87">
        <Group gap="md">
          <Text fw={500} c="white">Generative AI Playground </Text>
          <Button component={Link} to="/history" variant="white" color="dark">
            History
          </Button>
          <Button component={Link} to="/playground" variant="white" color="dark">
            Playground
          </Button>
        </Group>
        
        {isLoggedIn ? (
           <Button
            variant="white"
            color="dark"
            onClick={logout}
          >
            Logout
          </Button>
        ) : (
          <Button
            variant="white"
            color="dark"
            onClick={() => setLoginOpened(true)}
          >
            Login
          </Button>
        )}
        <LoginModal opened={loginOpened} onClose={() => setLoginOpened(false)} />
      </Group>
      <Divider />
    </>
  )
}
