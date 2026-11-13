import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCatalog } from "../lib/api.js";

export default function GamesPage() {
  const [games, setGames] = useState([]);
  const nav = useNavigate();

  useEffect(() => {
    getCatalog()
      .then((d) => setGames(d.games || []))
      .catch(() => setGames([]));
  }, []);

  return (
    <section className="sec">
      <div className="wrap">
        <div className="page-hero">
          <h1>All Games</h1>
          <p>Choose a game to top up</p>
        </div>
        <div className="games" style={{ marginTop: 16 }}>
          {games.map((g) => (
            <button
              key={g.id}
              type="button"
              className="gcard"
              onClick={() => nav("/topup/" + g.id)}
            >
              <div className="gthumb">{g.name.slice(0, 2).toUpperCase()}</div>
              <div className="gmeta">
                <strong>{g.name}</strong>
                <span>{g.tag}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
