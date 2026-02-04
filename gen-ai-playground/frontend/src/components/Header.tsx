import { Link } from "react-router-dom"

export default function Header() {
    return (
        // styles are only for better visibility at this moment
        <div style={{ padding: "10px", borderBottom: "1px solid #ccc", marginBottom: "20px" }}>
            <nav>
                <Link to="/">Image Generator</Link>
                <Link to="/history"> History</Link> {/* muutin pathin */}
            </nav>
        </div>

    )
}