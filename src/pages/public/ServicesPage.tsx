import { PageMeta } from "@/components/common/PageMeta";
import { SectionHeading } from "@/components/common/SectionHeading";

const serviceBlocks = [
  {
    title: "Speech review and feedback",
    copy: "Upload recordings, keep round notes attached, and organize feedback by event, format, or growth theme.",
  },
  {
    title: "Async partner matching",
    copy: "Connect students for turn-based rounds with clear status, deadlines, and future AI-ready recommendation slots.",
  },
  {
    title: "Coach-curated training library",
    copy: "Resources are grouped by delivery, rebuttal, research, and case-building so teams can move from theory to practice quickly.",
  },
  {
    title: "Community support",
    copy: "Channels help coaches and students share tactics, post reflections, and keep momentum outside tournament weekends.",
  },
];

export const ServicesPage = () => (
  <>
    <PageMeta
      title="Services"
      description="See the core speech, debate, coaching, and community features planned for Debate Studio."
    />
    <section className="section">
      <div className="page-shell">
        <SectionHeading
          eyebrow="Services"
          title="Coaching structure, practice rhythm, and community in one place"
          description="The product is set up to support both public-facing storytelling and deeper app workflows."
        />
        <div className="services-grid" style={{ marginTop: "2rem" }}>
          {serviceBlocks.map((service) => (
            <article key={service.title} className="card">
              <h3 className="card-title">{service.title}</h3>
              <p className="card-copy">{service.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  </>
);
