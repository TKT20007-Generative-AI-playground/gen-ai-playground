import { Box, Button, Card, Text, Title } from "@mantine/core"
import type { RefObject } from "react"

interface HoverCardProps {
  image: string
  title: string
  description: string
  buttonText: string
  cardRef: RefObject<HTMLDivElement | null>
  isVisible: boolean
  onClick?: () => void
}

const HoverCard = ({
  image,
  title,
  description,
  buttonText,
  cardRef,
  isVisible,
  onClick,
}: HoverCardProps) => {
  return (
    <Card
      ref={cardRef}
      shadow="sm"
      padding={0}
      radius="md"
      withBorder
      w={300}
      h={400}
      className={`hover-card fade-in ${isVisible ? "visible" : ""}`}
    >
      <Box
        className="hover-card-bg"
        style={{
          backgroundImage: `url(${image})`,
        }}
      />

      <Title order={3} className="hover-card-title">
        {title}
      </Title>

      <Box className="hover-card-content" p="lg">
        <Text size="sm" c="dimmed">
          {description}
        </Text>

        <Button className="btn-primary" fullWidth mt="md" onClick={onClick}>
          {buttonText}
        </Button>
      </Box>
    </Card>
  )
}

export default HoverCard
