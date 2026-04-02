import { PageMeta } from "@/components/common/PageMeta";
import { SectionHeading } from "@/components/common/SectionHeading";

export const AboutPage = () => (
  <>
    <PageMeta
      title="About"
      description="Learn how Debate Studio supports students and coaches with warm, structured debate practice."
    />
    <section className="section">
      <div className="page-shell">
        <SectionHeading
          eyebrow="About Debate Studio"
          title="Designed for students, coaches, and the work between tournaments"
          description="This brand direction combines editorial softness with high-accountability practice tools so the platform feels calm but never vague."
        />

        <div className="about-grid" style={{ marginTop: "2rem" }}>
          <article className="card">
            <h3 className="card-title">Who it serves</h3>
            <p className="card-copy">
              Students who want steadier practice habits and coaches who need a
              cleaner way to review speeches, share drills, and guide community.
            </p>
          </article>
          <article className="card">
            <h3 className="card-title">Why the aesthetic matters</h3>
            <p className="card-copy">
              Debate platforms often feel sterile. This one uses warmth, texture,
              and editorial pacing to reduce friction and make practice feel more
              inviting.
            </p>
          </article>
        </div>
      </div>
    </section>
  </>
);
