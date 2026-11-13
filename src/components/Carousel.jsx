import { useEffect, useState } from "react";

const SLIDES = [
  "/assets/carousel-1786899165894-IMG_0249.jpeg",
  "/assets/carousel-1793528650103-IMG_4532.jpeg",
];

export default function Carousel() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);

  return (
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
  );
}
