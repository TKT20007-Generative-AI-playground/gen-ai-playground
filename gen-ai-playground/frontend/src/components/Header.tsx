import { Link } from "react-router-dom"
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import LoginModal from './Login'
import { Group, Divider, Text } from "@mantine/core"

export default function Header() {
<<<<<<< HEAD
  const [loginOpened, setLoginOpened] = useState(false);
  const { isLoggedIn, logout } = useAuth();

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #ccc', marginBottom: '20px' }}>
        <Link to="/">Image Generator</Link>
                <Link to="/history"> History</Link> {/* muutin pathin */}

=======
  const [loginOpened, setLoginOpened] = useState(false)
  const { isLoggedIn, logout } = useAuth()

  return (
    <>
      <Group justify="space-between" p="md">
        <Group gap="md">
          <Link to="/history"> History</Link> {/* muutin pathin */}
          <Link to="/playground">Playground</Link>
          <Text fw={500}> Welcome to the Gen AI Playground! </Text>
        </Group>
        
>>>>>>> origin/edit-image
        {isLoggedIn ? (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              logout()
            }}
          >
            Logout
          </a>
        ) : (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              setLoginOpened(true)
            }}
          >
            Login
          </a>
        )}
        <LoginModal opened={loginOpened} onClose={() => setLoginOpened(false)} />
      </Group>
      <Divider />
    </>
  )
}
