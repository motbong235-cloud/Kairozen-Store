import { NavLink, Outlet } from "react-router-dom";

const linkClass = ({ isActive }) => (isActive ? "active" : undefined);

export default function Layout() {
  return (
    <>
      <header className="header">
        <div className="wrap header-inner">
          <NavLink className="logo-row" to="/">
            <span className="logo-mark">K</span>
            <span className="logo-text">
              Kairozen <span>Store</span>
            </span>
          </NavLink>
          <nav className="nav-d">
            <NavLink to="/" end className={linkClass}>
              Home
            </NavLink>
            <NavLink to="/games" className={linkClass}>
              Games
            </NavLink>
            <NavLink to="/topup" className={linkClass}>
              Top Up
            </NavLink>
            <NavLink to="/faq" className={linkClass}>
              FAQ
            </NavLink>
            <NavLink to="/track" className={linkClass}>
              Track
            </NavLink>
          </nav>
          <NavLink className="btn btn-p" to="/topup">
            Top Up
          </NavLink>
        </div>
      </header>

      <main className="layout-main">
        <Outlet />
      </main>

      <footer>
        <div className="wrap">© 2026 Kairozen Store · React pages · RielPay · Khmer TopUp</div>
      </footer>

      <nav className="mbar">
        <NavLink to="/" end className={linkClass}>
          Home
        </NavLink>
        <NavLink to="/games" className={linkClass}>
          Games
        </NavLink>
        <NavLink to="/topup" className={linkClass}>
          Top Up
        </NavLink>
        <NavLink to="/faq" className={linkClass}>
          FAQ
        </NavLink>
      </nav>
    </>
  );
}
