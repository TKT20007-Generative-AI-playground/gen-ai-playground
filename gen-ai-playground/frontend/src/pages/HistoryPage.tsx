import { Container, Title } from "@mantine/core"
import History from "../components/History"
import { useMediaQuery } from "@mantine/hooks"
export default function HistoryPage() {
  const isMobile = useMediaQuery("(max-width: 768px)")
  return (
    <Container size={isMobile ? "sm" : "xl"} py="md">
      <History />
    </Container>
  )
}
