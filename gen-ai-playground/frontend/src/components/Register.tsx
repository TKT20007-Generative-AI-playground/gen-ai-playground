import { useState } from "react"
import { useNavigate, Navigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { getAxiosDetailMessage } from "../utils/errors"
import { registerRequest } from "../services/authService"
import {
  Container,
  Paper,
  TextInput,
  PasswordInput,
  Button,
  Title,
  Stack,
} from "@mantine/core"
import { notifications } from '@mantine/notifications'

export default function Register() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const { isLoggedIn } = useAuth()
  const navigate = useNavigate()

  if (isLoggedIn) {
    return <Navigate to="/playground" replace />
  }

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return "Password must be at least 8 characters long"
    }
    if (!/[A-Z]/.test(password)) {
      return "Password must contain at least one uppercase letter"
    }
    if (!/[0-9]/.test(password)) {
      return "Password must contain at least one number"
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return "Password must contain at least one special character"
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      notifications.show({
        title: "Failure",
        message: "Passwords do not match",
        color: "red",
      })
      return
    }

    const validationError = validatePassword(password)
    if (validationError) {
      notifications.show({
        title: "Failure",
        message: validationError,
        color: "red",
      })
      return
    }

    try {
      await registerRequest({
        username,
        password,
        invitation_code: inviteCode,
      })

      notifications.show({
        title: "Success",
        message: "User registered successfully!",
        color: "green",
      })
      setUsername("")
      setPassword("")
      setConfirmPassword("")
      setInviteCode("")
      setPasswordError("")
      setTimeout(() => {
        navigate("/", { state: { openLoginModal: true } })
      }, 1500) // timeout so that the user can see that registration was successful
    } catch (err) {
      const detail = getAxiosDetailMessage(err)
      notifications.show({
        title: "Failure",
        message: !detail || detail === "Network Error" ? "Registration failed" : detail,
        color: "red",
      })
    }
  }

  return (
    <Container size={420} my="xl">
      <Title ta="center" mb="md">
        Create an account
      </Title>

      <Paper withBorder shadow="md" p="lg" radius="md">
        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput
              label="Username"
              placeholder="Your username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              data-testid="register-username"
            />

            <PasswordInput
              label="Password"
              placeholder="Your password"
              value={password}
              onChange={e => {
                const value = e.target.value
                setPassword(value)

                const err = validatePassword(value)
                setPasswordError(err || "")
              }}
              error={passwordError}
              required
              data-testid="register-password"
            />

            <PasswordInput
              label="Confirm password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
            />

            <TextInput
              label="Invitation code"
              placeholder="Required to register"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value)}
              required
            />

            <Button type="submit" fullWidth mt="sm">
              Create user
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  )
}
