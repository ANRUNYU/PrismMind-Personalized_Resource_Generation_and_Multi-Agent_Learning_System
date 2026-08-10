import DynamicRadarChart from "../components/DynamicRadarChart/DynamicRadarChart.jsx";
import TopNav from "../components/TopNav/TopNav.jsx";

export default function RadarProfilePage() {
  return (
    <main className="radar-profile-page">
      <TopNav />
      <div className="radar-page-grid" aria-label="Dynamic six dimension radar profile">
        <section className="radar-stage">
          <div className="hud-line hud-line-top" aria-hidden="true" />
          <div className="hud-line hud-line-bottom" aria-hidden="true" />
          <DynamicRadarChart />
        </section>
      </div>
    </main>
  );
}
