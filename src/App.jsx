import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import HomePage from "./pages/HomePage.jsx";
import GamesPage from "./pages/GamesPage.jsx";
import TopupPage from "./pages/TopupPage.jsx";
import FaqPage from "./pages/FaqPage.jsx";
import TrackPage from "./pages/TrackPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="topup" element={<TopupPage />} />
        <Route path="topup/:gameId" element={<TopupPage />} />
        <Route path="faq" element={<FaqPage />} />
        <Route path="track" element={<TrackPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
