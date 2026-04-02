import { NavLink } from "react-router-dom";
import { PageMeta } from "@/components/common/PageMeta";
import { SectionHeading } from "@/components/common/SectionHeading";
import { channels, debateThreads, events, resources, speeches } from "@/data/mockData";

export const HomePage = () => (
  <>
    <PageMeta
      title="Boho Speech and Debate Coaching"
      description="Speech uploads, async rounds, coach feedback, and community support in a warm editorial workspace."
    />

    <section className="section">
      <div className="page-shell hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Grounded debate practice</p>
          <h1>
            Build calm confidence, sharper cases, and better rounds.
          </h1>
          <p>
            Debate Studio gives students and coaches a soft, structured place to
            upload speeches, run async debates, collect feedback, and stay
            connected between tournaments.
          </p>
          <div className="hero-actions">
            <NavLink to="/signup" className="btn btn-primary">
              Start free
            </NavLink>
            <NavLink to="/services" className="btn btn-secondary">
              Explore coaching
            </NavLink>
          </div>
          <div className="stats-band">
            <div className="metric-card">
              <span>Recent uploads</span>
              <strong>{speeches.length}</strong>
            </div>
            <div className="metric-card">
              <span>Practice debates</span>
              <strong>{debateThreads.length}</strong>
            </div>
            <div className="metric-card">
              <span>Curated resources</span>
              <strong>{resources.length}</strong>
            </div>
            <div className="metric-card">
              <span>Active channels</span>
              <strong>{channels.length}</strong>
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="shape" />
          <div className="shape-secondary" />
          <div className="photo-stack">
            <div className="photo-frame large">
              <div className="photo-fill" />
            </div>
            <div className="photo-frame small">
              <div className="photo-fill coaches" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="section">
      <div className="page-shell">
        <SectionHeading
          eyebrow="What lives inside"
          title="A public-facing brand and a real student workspace"
          description="The site blends an editorial boho aesthetic with practical product surfaces so marketing, onboarding, and day-to-day debate work feel like part of the same world."
        />

        <div className="services-grid" style={{ marginTop: "1.5rem" }}>
          <article className="card">
            <h3 className="card-title">Speech Upload Studio</h3>
            <p className="card-copy">
              Upload round recordings, tag formats, track transcript status, and
              keep coach feedback attached to each performance.
            </p>
          </article>
          <article className="card">
            <h3 className="card-title">Async Debate Practice</h3>
            <p className="card-copy">
              Match with partners, reply turn by turn, and keep deadlines,
              summaries, and round momentum visible.
            </p>
          </article>
          <article className="card">
            <h3 className="card-title">Resources + Community</h3>
            <p className="card-copy">
              Save drills, browse coach curation, follow channels, and trade
              practical advice without leaving the app shell.
            </p>
          </article>
        </div>
      </div>
    </section>

    <section className="section">
      <div className="page-shell about-grid">
        <div className="organic-panel">
          <p className="eyebrow">Method</p>
          <h2 className="display">A softer visual language for intense work.</h2>
          <p className="muted">
            The tone is warm, earthy, and grounded, but the experience stays
            practical: dashboards, saved resources, partner matching, and clear
            next steps after each upload.
          </p>
        </div>
        <div className="quote-card">
          <p>
            “The best debate tools do not just organize tasks. They make
            students feel steady enough to think clearly, speak boldly, and keep
            practicing.”
          </p>
          <footer>Placeholder testimonial from a lead coach</footer>
        </div>
      </div>
    </section>

    <section className="section">
      <div className="page-shell">
        <SectionHeading
          eyebrow="Upcoming rhythm"
          title="Support the whole week between rounds"
          description="The dashboard is designed around continuity: what you uploaded, what is due next, which communities you follow, and what resources can help right now."
        />

        <div className="three-up" style={{ marginTop: "1.5rem" }}>
          {events.map((event) => (
            <article key={event.id} className="card">
              <span className="pill">{event.type}</span>
              <h3 className="card-title" style={{ fontSize: "1.5rem", marginTop: "1rem" }}>
                {event.name}
              </h3>
              <p className="card-copy">
                {event.location} • {new Date(event.date).toLocaleDateString()}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section className="section">
      <div className="page-shell organic-panel">
        <div className="cta-grid" style={{ gridTemplateColumns: "1.2fr 0.8fr" }}>
          <div>
            <p className="eyebrow">Launch path</p>
            <h2 className="display">Start with a branded homepage, then step into the full app.</h2>
            <p className="muted">
              Sign up to see the dashboard, upload your first speech, browse
              resources, and move into async practice rounds.
            </p>
          </div>
          <div className="button-row" style={{ alignSelf: "center", justifyContent: "flex-start" }}>
            <NavLink to="/signup" className="btn btn-primary">
              Create account
            </NavLink>
            <NavLink to="/app/dashboard" className="btn btn-secondary">
              View app shell
            </NavLink>
          </div>
        </div>
      </div>
    </section>
  </>
);
