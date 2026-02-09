import { useEffect, useState } from "react";


interface ImageRecord {
  prompt: string
  model: string
  timestamp: string
  image_data: string
  image_type: string | null | undefined
}

interface PromtGroup {
  prompt: string
  images: ImageRecord[]
}
const backendUrl = import.meta.env.VITE_API_URL

export default function History() {
  const [history, setHistory] = useState<PromtGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${backendUrl}/images/history`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        "Content-Type": "application/json"
      }
    })
      .then(res => res.json())
      .then(data => {
        const groups: { [prompt: string]: ImageRecord[] } = {};
        (data.history || []).forEach((item: ImageRecord) => {
          if (!groups[item.prompt]) groups[item.prompt] = []
          groups[item.prompt].push(item)
        });
        const grouped = Object.keys(groups).map(prompt => ({
          prompt,
          images: groups[prompt],
        }));
        setHistory(grouped);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch history:", err)
        setLoading(false);
      });
  }, []);


  if (loading) return <p>Loading history...</p>
  if (history.length === 0) return <p>No history to show.</p>

  return (
    <div>
      <h2>History</h2>
      {history.map((group, idx) => (
        <div key={idx} style={{ marginBottom: "2rem" }}>
          <h3>{group.prompt}</h3>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {group.images.map((item, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <img
                  src={`data:image/png;base64,${item.image_data}`}
                  alt={item.prompt}
                  style={{ maxWidth: "200px", maxHeight: "200px", objectFit: "contain" }}
                />
                <p>Model: {item.model}</p>
                <p>Time: {new Date(item.timestamp).toLocaleString()}</p>
                <p>Type: {item.image_type} </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
