type PhotoAreaProps = {
    src: string | null
    alt: string
}
export default function PhotoArea({ src, alt }: PhotoAreaProps) {
    if (!src) {
        return <div></div>
    }
    return (
        <div style={{
            border: "1px solid #ccc",
            padding: "10px",
            marginLeft: "20px",
            height: "450px",
            width: "650px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
        }}>
            <img src={src} alt={alt}
            style={{
                maxWidth: "100%",
                maxHeight:"100%",
                objectFit: "contain"
            }} />
        </div>
    )
}