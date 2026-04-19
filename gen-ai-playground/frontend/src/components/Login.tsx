import {
  Modal,
  TextInput,
  PasswordInput,
  Button,
  Stack,
  Text,
  Anchor,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { loginRequest } from '../services/authService'

interface LoginModalProps {
  opened: boolean
  onClose: () => void
  redirectTo?: string | null
}

export default function LoginModal({ opened, onClose, redirectTo }: LoginModalProps) {
  const { login } = useAuth()
  const navigate = useNavigate()

  const form = useForm({
    initialValues: {
      username: "",
      password: "",
    },
  })

  const handleSubmit = async (values: typeof form.values) => {
    try {
      const res = await loginRequest(values)

      login(res.token, res.username, res.is_admin || false)
      onClose()
      if (redirectTo) {
        navigate(redirectTo)
      }
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
      alert(detail || "Login failed")
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Login" centered>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <TextInput
            label="Username"
            placeholder="Your username"
            required
            data-testid="login-username"
            {...form.getInputProps("username")}
          />

          <PasswordInput
            label="Password"
            placeholder="Your password"
            required
            data-testid="login-password"
            {...form.getInputProps("password")}
          />

          <Button type="submit" fullWidth>
            Login
          </Button>

          <Text size="sm" ta="center">
            Don’t have an account?{" "}
            <Anchor component={Link} to="/register" onClick={onClose}>
              Register
            </Anchor>
          </Text>
        </Stack>
      </form>
    </Modal>
  )
}
