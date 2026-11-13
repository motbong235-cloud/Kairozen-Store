import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getCatalog } from "../lib/api.js";

const SLIDES = [
  "/assets/carousel-1786899165894-IMG_0249.jpeg",
  "/assets/carousel-1793528650103-IMG_4532.jpeg",
];

const DEALS = [
  { t: "MLBB 706", p: "$8.10", o: "$9.00", i: "ML" },
  { t: "FF 520", p: "$4.49", o: "$4.99", i: "FF" },
  { t: "PUBG 660", p: "$8.99", o: "$9.99", i: "UC" },
  { t: "Robux 800", p: "$8.99", o: "$9.99", i: "RB" },
];

export default function HomePage() {
  const [games, setGames] = useState([]);
  const [idx, setIdx] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    getCatalog()
      .then((d) => setGames((d.games || []).slice(0, 12)))
      .catch(() => setGames([]));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 4800);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      {/* Hero carousel — KonpKay style */}
      <section className="hero">
        <div className="wrap">
          <div className="car">
            <div className="car-frame">
              <div
                className="car-track"
                style={{ transform: `translateX(-${idx * 100}%)` }}
              >
                {SLIDES.map((src) => (
                  <div className="slide" key={src}>
                    <img src={src} alt="" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="dots">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                className={"dot" + (i === idx ? " on" : "")}
                onClick={() => setIdx(i)}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Popular */}
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

      {/* Flash deals */}
      <section className="sec" style={{ paddingTop: 4 }}>
        <div className="wrap">
          <div className="fd-tag">FLASH DEALS</div>
          <div className="sec-top">
            <h2>Special offers</h2>
          </div>
          <div className="fd-row">
            {DEALS.map((d) => (
              <div className="fd-card" key={d.t}>
                <span className="fd-hot">HOT</span>
                <div className="fd-ic">{d.i}</div>
                <div className="fd-info">
                  <strong>{d.t}</strong>
                  <div>
                    <span className="fd-price">{d.p}</span>
                    <span className="fd-old">{d.o}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="sec">
        <div className="wrap">
          <div className="sec-top">
            <h2 className="why-title">Why Gamers Choose Us</h2>
          </div>
          <p className="sec-lead">
            Top up with confidence. Fastest, safest, and most affordable diamonds
            &amp; UC in Cambodia.
          </p>
          <div className="perks">
            <article className="perk">
              <div className="n">01</div>
              <h3>Instant Delivery</h3>
              <p>Diamonds and credits within seconds. No waiting queues.</p>
            </article>
            <article className="perk">
              <div className="n">02</div>
              <h3>Secure Payment</h3>
              <p>ABA, KHQR and trusted local methods with bank-level security.</p>
            </article>
            <article className="perk">
              <div className="n">03</div>
              <h3>Official Partner</h3>
              <p>Authorized routes — 100% legitimate currency every time.</p>
            </article>
          </div>
          <div className="strip">
            <div>
              <strong>Official</strong>
              <span>01 · Kairozen digital partner — verified suppliers.</span>
            </div>
            <div>
              <strong>10+</strong>
              <span>02 · Local payment support through KHQR.</span>
            </div>
            <div>
              <strong>30+</strong>
              <span>03 · Multiple products gamers love.</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ teaser */}
      <section className="sec">
        <div className="wrap">
          <div className="faq-box">
            <h2>
              Frequently Asked
              <br />
              Questions (FAQs)
            </h2>
            <p className="sub">Find answers about top-up at Kairozen Store.</p>
            <div className="faq-list">
              <details className="fi" open>
                <summary>How fast is delivery?</summary>
                <p>Most orders finish within seconds after KHQR confirms.</p>
              </details>
              <details className="fi">
                <summary>Which payments do you accept?</summary>
                <p>ABA PayWay / KHQR via RielPay.</p>
              </details>
            </div>
          </div>
          <div className="support">
            <h3>Tell your problem, Don&apos;t Keep it to yourself!</h3>
            <Link className="btn btn-p" to="/faq">
              Read FAQ
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
