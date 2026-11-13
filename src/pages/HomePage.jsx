import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getCatalog } from "../lib/api.js";

export default function HomePage() {
  const [games, setGames] = useState([]);
  const nav = useNavigate();

  useEffect(() => {
    getCatalog()
      .then((d) => setGames((d.games || []).slice(0, 12)))
      .catch(() => setGames([]));
  }, []);

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="car">
            <div className="car-frame">
              <div>
                <h1>Game Diamonds &amp; Top Up</h1>
                <p>Fast, safe top-up in Cambodia. Pay with ABA KHQR via RielPay.</p>
                <Link className="btn btn-p" to="/games">
                  Browse games
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" id="games">
        <div className="wrap">
          <div className="sec-top">
            <h2>Popular</h2>
            <Link to="/games">See all</Link>
          </div>
          <div className="games">
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

      <section className="sec">
        <div className="wrap">
          <div className="sec-top">
            <h2>Why Gamers Choose Us</h2>
          </div>
          <div className="perks">
            <article className="perk">
              <div className="n">01</div>
              <h3>Instant Delivery</h3>
              <p>Diamonds in seconds after payment confirms.</p>
            </article>
            <article className="perk">
              <div className="n">02</div>
              <h3>Secure Payment</h3>
              <p>ABA KHQR via RielPay — bank-level protection.</p>
            </article>
            <article className="perk">
              <div className="n">03</div>
              <h3>Official Partner</h3>
              <p>Khmer TopUp API routes for legitimate currency.</p>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
