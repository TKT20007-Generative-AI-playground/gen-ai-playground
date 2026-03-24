import { useEffect, useRef, useState } from "react"

const useFadeIn = (delay: number = 0) => {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    let timeoutId: ReturnType<typeof setTimeout>
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timeoutId = setTimeout(() => setIsVisible(true), delay)
          observer.unobserve(element)
        }
      },
      { threshold: 0.1 },
    )

    observer.observe(element)
    return () => {
      clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [delay])

  return { ref, isVisible }
}

export default useFadeIn
