import { useCallback, useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import Carousel from "./components/Carousel.jsx";
import GameGrid from "./components/GameGrid.jsx";
import CheckoutModal from "./components/CheckoutModal.jsx";
import { getCatalog } from "./lib/api.js";

export default function App() {
  const [games, setGames] = useState([]);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    getCatalog()
      .then((d) => setGames(d.games || []))
      .catch(() => setGames([]));
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2800);
  }, []);

  return (
    <>
      <Header />
      <main>
        <Carousel />
        <GameGrid games={games} onSelect={setSelected} />
        <section className="sec" id="why">
          <div className="wrap">
            <div className="sec-top">
              <h2>Why Gamers Choose Us</h2>
            </div>
            <p className="muted">
              Instant delivery · Secure ABA KHQR · Official partner routes.
            </p>
          </div>
        </section>
      </main>
      <footer>
        <div className="wrap">
          © 2026 Kairozen Store · React · RielPay · Khmer TopUp
        </div>
      </footer>
      <nav className="mbar">
        <a className="active" href="#games">
          Home
        </a>
        <a href="#games">Games</a>
        <a href="#why">Help</a>
      </nav>

      {selected && (
        <CheckoutModal
          game={selected}
          onClose={() => setSelected(null)}
          onToast={showToast}
        />
      )}
      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
