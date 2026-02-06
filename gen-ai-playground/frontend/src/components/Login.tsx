import {
  Modal,
  TextInput,
  PasswordInput,
  Button,
  Stack,
  Text,
  Anchor,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface LoginModalProps {
  opened: boolean;
  onClose: () => void;
}

export default function LoginModal({ opened, onClose }: LoginModalProps) {
  const { login } = useAuth();

  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const form = useForm({
    initialValues: {
      username: '',
      password: '',
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    try {
      const res = await fetch(`${backendUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.detail || 'Login failed');
        return;
      }

      login(data.token, data.username);
      onClose();
    } catch {
      alert('Server unreachable');
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Login" centered>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <TextInput
            label="Username"
            placeholder="Your username"
            required
            {...form.getInputProps('username')}
          />

          <PasswordInput
            label="Password"
            placeholder="Your password"
            required
            {...form.getInputProps('password')}
          />

          <Button type="submit" fullWidth>
            Login
          </Button>

          <Text size="sm" ta="center">
            Don’t have an account?{" "}
            <Anchor
              component={Link}
              to="/register"
              onClick={onClose}
            >
              Register
            </Anchor>
          </Text>
        </Stack>
      </form>
    </Modal>
  );
}

