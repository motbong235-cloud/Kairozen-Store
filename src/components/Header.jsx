export default function Header() {
  return (
    <header className="header">
      <div className="wrap header-inner">
        <a className="logo-row" href="/">
          <span className="logo-mark">K</span>
          <span className="logo-text">
            Kairozen <span>Store</span>
          </span>
        </a>
        <nav className="nav-d">
          <a href="#games">Games</a>
          <a href="#why">Why us</a>
        </nav>
        <div>
          <a className="btn btn-p" href="#games">
            Top Up
          </a>
        </div>
      </div>
    </header>
  );
}
