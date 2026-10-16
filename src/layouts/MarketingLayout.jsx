import { Outlet } from "react-router-dom";
import AtmosphericBackground from "../components/AtmosphericBackground.jsx";
import NeonBackdrop from "../components/charts/NeonBackdrop.jsx";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";

export default function MarketingLayout() {
  return (
    <div className="min-h-screen text-white">
      <AtmosphericBackground />
      <NeonBackdrop />
      <div className="relative z-10">
        <Navbar />
        <main className="pt-16"><Outlet /></main>
        <Footer />
      </div>
    </div>
  );
}
