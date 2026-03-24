import { Box, Button, Group, Image, Stack, Text, Title } from "@mantine/core"
import { Carousel } from "@mantine/carousel"
import AutoScroll from "embla-carousel-auto-scroll"
import { useRef } from "react"
import { useNavigate } from "react-router-dom"
import HoverCard from "../components/HoverCard"
import useFadeIn from "../hooks/useFadeIn"
import { useAuth } from "../context/AuthContext"

const showcaseFiles = import.meta.glob<string>("../assets/showcase/*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
})
const showcaseImages = Object.entries(showcaseFiles).map(([path, url]) => ({
  name: path.split("/").pop()!,
  url,
}))

const titleStyle = {
  c: "white",
  ff: "'Google sans', sans-serif",
  lh: 1,
  m: 0,
}

const headerColor = "#000F65"

const Front = () => {
  const autoplay = useRef(
    AutoScroll({ speed: 1, stopOnInteraction: false, stopOnMouseEnter: true }),
  )
  const heroTitles = useFadeIn(0)
  const heroButton = useFadeIn(200)
  const hoverCard1 = useFadeIn(200)
  const hoverCard2 = useFadeIn(400)
  const hoverCard3 = useFadeIn(600)
  const bannerFade = useFadeIn(800)
  const carouselFade = useFadeIn(400)
  const { isLoggedIn } = useAuth()
  const navigate = useNavigate()

  const handleLoggedIn = (url: string) => {
    if (isLoggedIn) {
      navigate(`/playground/${url || "ImageGenerator"}`)
    } else {
      navigate("/", {
        state: { openLoginModal: true, redirectTo: `/playground/${url || "ImageGenerator"}` },
      })
    }
  }

  const handleShowcaseClick = async (img: { url: string }) => {
    if (!isLoggedIn) {
      navigate("/", { state: { openLoginModal: true, redirectTo: `/` } })
      return
    }
    const res = await fetch(img.url)
    const blob = await res.blob()
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(",")[1]
      navigate("/playground/ImageEditor", {
        state: {
          imageToEdit: {
            image_data: base64,
            image_type: blob.type.split("/")[1],
            prompt: "",
            model: "",
          },
        },
      })
    }
    reader.readAsDataURL(blob)
  }

  return (
    <>
      <Box style={{ position: "relative", height: "40vh", overflow: "hidden" }}>
        <video
          autoPlay
          loop
          muted
          playsInline
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        >
          <source src="/videos/background-video.mp4" type="video/mp4" />
        </video>

        <Box
          style={{
            position: "relative",
            height: "100%",
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Group
            align="center"
            gap="xl"
            w={{ base: "90%", sm: "70%", md: "40%" }}
            justify="space-between"
            wrap="wrap"
          >
            <Stack
              gap={0}
              ref={heroTitles.ref}
              className={`fade-in ${heroTitles.isVisible ? "visible" : ""}`}
            >
              <Title
                {...titleStyle}
                style={{ paddingBottom: "2rem" }}
                fz={{ base: "1.5rem", sm: "2rem", md: "3rem" }}
              >
                WELCOME TO
              </Title>
              <Title {...titleStyle} fz={{ base: "2rem", sm: "3rem", md: "4rem" }}>
                GENERATIVE AI
              </Title>
              <Title {...titleStyle} fz={{ base: "2rem", sm: "3rem", md: "4rem" }}>
                PLAYGROUND
              </Title>
            </Stack>
            <Box
              ref={heroButton.ref}
              className={`fade-in ${heroButton.isVisible ? "visible" : ""}`}
            >
              <Button
                size="lg"
                variant="white"
                onClick={() => handleLoggedIn("ImageGenerator")}
                style={{ color: headerColor, paddingLeft: "2rem", paddingRight: "2rem" }}
              >
                Get Started
              </Button>
            </Box>
          </Group>
        </Box>
      </Box>

      <Box style={{ padding: "4rem 0" }}>
        <Group gap="xl" justify="center" wrap="wrap">
          <HoverCard
            image="/images/flux-gen.png"
            title="Image generators"
            description="Test different Flux image generation models and find the best one for your needs."
            buttonText="Go to image generators"
            cardRef={hoverCard1.ref}
            isVisible={hoverCard1.isVisible}
            onClick={() => handleLoggedIn("ImageGenerator")}
          />
          <HoverCard
            image="/images/flux-edit.png"
            title="Image Editor"
            description="Edit different images using Flux image editing models and compare the results."
            buttonText="Go to image editor"
            cardRef={hoverCard2.ref}
            isVisible={hoverCard2.isVisible}
            onClick={() => handleLoggedIn("ImageEditor")}
          />
          <HoverCard
            image="/images/text-generate.png"
            title="Text generators"
            description="Deploy different text generation models and test them with your own prompts to find the best one for your use case."
            buttonText="Go to text generators"
            cardRef={hoverCard3.ref}
            isVisible={hoverCard3.isVisible}
            onClick={() => handleLoggedIn("TextGenerator")}
          />
        </Group>
      </Box>

      <Box
        ref={bannerFade.ref}
        className={`fade-in ${bannerFade.isVisible ? "visible" : ""}`}
        style={{ display: "flex", justifyContent: "center", padding: "0 1rem" }}
      >
        <Box
          style={{
            width: "100%",
            maxWidth: 964,
            background: "linear-gradient(135deg, #000F65, #1a3a8a)",
            borderRadius: "var(--mantine-radius-md)",
            padding: "2rem 3rem",
            color: "white",
            fontFamily: "'Google sans', sans-serif",
          }}
        >
          <Title order={3} mb="sm" style={{ color: "white" }}>
            Get started with the Generative AI Playground
          </Title>
          <Text size="md" style={{ opacity: 0.85, lineHeight: 1.6 }}>
            1. Click the "Get Started" button above or login from the top right corner <br />
            2. If you don't have an account, sign up <br />
            3. Start testing different models and find the best one for your needs! <br />
            4. Check out the featured works below for inspiration and see what others have created!
          </Text>
        </Box>
      </Box>

      {showcaseImages.length > 0 && (
        <Box
          style={{ padding: "4rem 2rem" }}
          ref={carouselFade.ref}
          className={`fade-in ${carouselFade.isVisible ? "visible" : ""}`}
        >
          <Carousel
            height={300}
            slideSize={{ base: "100%", sm: "50%", md: "33.333%" }}
            slideGap="md"
            emblaOptions={{ loop: true, align: "start" }}
            plugins={[autoplay.current]}
          >
            {showcaseImages.map(img => (
              <Carousel.Slide key={img.name}>
                <Box
                  style={{
                    position: "relative",
                    height: "100%",
                    overflow: "hidden",
                    borderRadius: "var(--mantine-radius-md)",
                  }}
                  className="showcase-slide"
                >
                  <Image src={img.url} h="100%" fit="cover" />
                  <Button
                    className="showcase-edit-btn"
                    size="sm"
                    variant="white"
                    style={{
                      color: headerColor,
                      position: "absolute",
                      paddingLeft: "2rem",
                      paddingRight: "2rem",
                      bottom: 12,
                      left: "50%",
                      transform: "translateX(-50%)",
                      opacity: 0,
                      transition: "opacity 0.2s",
                    }}
                    onClick={() => handleShowcaseClick(img)}
                  >
                    Edit
                  </Button>
                </Box>
              </Carousel.Slide>
            ))}
          </Carousel>
        </Box>
      )}

      <Box style={{ display: "flex", justifyContent: "center", padding: "0 1rem" }}>
        <Group
          gap="xl"
          justify="center"
          wrap="wrap"
          style={{
            width: "100%",
            maxWidth: 964,
            borderRadius: "var(--mantine-radius-md)",
            padding: "2rem 3rem",
            color: "white",
            fontFamily: "'Google sans', sans-serif",
          }}
        >
          <Button
            component="a"
            href="https://github.com/TKT20007-Generative-AI-playground/gen-ai-playground"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline"
            size="xl"
            px="xl"
            leftSection={<Image src="/images/github.png" w={24} h={24} />}
          >
            GitHub
          </Button>
        </Group>
      </Box>
    </>
  )
}

export default Front
