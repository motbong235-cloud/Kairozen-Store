import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <section className="sec">
      <div className="wrap" style={{ textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--disp)" }}>404</h1>
        <p style={{ color: "var(--muted)", margin: "8px 0 16px" }}>Page not found</p>
        <Link className="btn btn-p" to="/">
          Home
        </Link>
      </div>
    </section>
  );
}
