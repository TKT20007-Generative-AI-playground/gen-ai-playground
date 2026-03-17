import { Box, Button, Group, Image, Stack, Title } from "@mantine/core";
import { Carousel } from "@mantine/carousel";
import AutoScroll from "embla-carousel-auto-scroll";
import { useRef } from "react";
import HoverCard from "../components/HoverCard";
import useFadeIn from "../hooks/useFadeIn";

const titleStyle = {
    c: "white",
    ff: "'Google sans', sans-serif",
    lh: 1,
    m: 0,
};

const headerColor = "#000F65"

const Main = () => {
    const autoplay = useRef(AutoScroll({ speed: 1, stopOnInteraction: false, stopOnMouseEnter: true }));
    const heroTitles = useFadeIn(0);
    const heroButton = useFadeIn(400);

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
                    top: 0, left: 0,
                    width: "100%", height: "100%",
                    objectFit: "cover",
                }}
            >
                <source src="/videos/background-video.mp4" type="video/mp4" />
            </video>

            <Box style={{ position: "relative", height: "100%", background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Group align="center" gap="xl" w={{ base: "90%", sm: "70%", md: "40%" }} justify="space-between" wrap="wrap">
                    <Stack gap={0} ref={heroTitles.ref} className={`fade-in ${heroTitles.isVisible ? "visible" : ""}`}>
                        <Title {...titleStyle} style={{ paddingBottom: "2rem"}} fz={{ base: "1.5rem", sm: "2rem", md: "3rem" }}>WELCOME TO</Title>
                        <Title {...titleStyle} fz={{ base: "2rem", sm: "3rem", md: "4rem" }}>GENERATIVE AI</Title>
                        <Title {...titleStyle} fz={{ base: "2rem", sm: "3rem", md: "4rem" }}>PLAYGROUND</Title>
                    </Stack>
                    <Box ref={heroButton.ref} className={`fade-in ${heroButton.isVisible ? "visible" : ""}`}>
                        <Button size="lg" variant="white" style={{ color: headerColor, paddingLeft: "2rem", paddingRight: "2rem" }}>Get Started</Button>
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
                        buttonText="Test image generators"
                        delay={800}
                    />
                    <HoverCard
                        image="/images/flux-edit.png"
                        title="Image Editor"
                        description="Edit different images using Flux image editing models and find the best one for your needs."
                        buttonText="Test image editor"
                        delay={1000}
                    />
                    <HoverCard
                        image="/images/text-generate.png"
                        title="Text generators"
                        description="Generate text using different text generation models and find the best one for your needs."
                        buttonText="Test text generators"
                        delay={1200}
                    />
                </Group>
            </Box>

            <Box style={{ padding: "4rem 2rem" }}>
                <Title order={2} ta="center" mb="xl" style={{ color: headerColor, fontFamily: "'Google sans', sans-serif" }}>
                    Featured Works
                </Title>
                <Carousel
                    withIndicators
                    height={300}
                    slideSize={{ base: "100%", sm: "50%", md: "33.333%" }}
                    slideGap="md"
                    emblaOptions={{ loop: true, align: "start" }}
                    plugins={[autoplay.current]}
                >
                    <Carousel.Slide>
                        <Image src="/images/flux-gen.png" h="100%" fit="cover" radius="md" />
                    </Carousel.Slide>
                    <Carousel.Slide>
                        <Image src="/images/flux-edit.png" h="100%" fit="cover" radius="md" />
                    </Carousel.Slide>
                    <Carousel.Slide>
                        <Image src="/images/text-generate.png" h="100%" fit="cover" radius="md" />
                    </Carousel.Slide>
                    <Carousel.Slide>
                        <Image src="/images/flux-gen.png" h="100%" fit="cover" radius="md" />
                    </Carousel.Slide>
                    <Carousel.Slide>
                        <Image src="/images/flux-edit.png" h="100%" fit="cover" radius="md" />
                    </Carousel.Slide>
                    <Carousel.Slide>
                        <Image src="/images/text-generate.png" h="100%" fit="cover" radius="md" />
                    </Carousel.Slide>
                </Carousel>
            </Box>
        </>
    );
};


export default Main;