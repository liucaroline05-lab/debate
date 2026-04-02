import { PageMeta } from "@/components/common/PageMeta";
import { SectionHeading } from "@/components/common/SectionHeading";

export const ContactPage = () => (
  <>
    <PageMeta
      title="Contact"
      description="Reach out for onboarding, coaching questions, or partnership conversations."
    />
    <section className="section">
      <div className="page-shell">
        <SectionHeading
          eyebrow="Contact"
          title="A simple intake flow for students, families, and coaches"
          description="This page can later connect to Firebase-backed intake submissions or a scheduling integration. For now it provides a branded placeholder."
        />

        <div className="contact-grid" style={{ marginTop: "2rem" }}>
          <div className="organic-panel">
            <h3 className="card-title">Start the conversation</h3>
            <p className="card-copy">
              Use this route for contact forms, discovery calls, workshop
              requests, or general support.
            </p>
            <div className="stack" style={{ marginTop: "1rem" }}>
              <div className="list-item">
                <strong>Email</strong>
                <span className="meta-line">hello@debatestudio.com</span>
              </div>
              <div className="list-item">
                <strong>Best for</strong>
                <span className="meta-line">Team setup, coaching inquiries, pilot programs</span>
              </div>
            </div>
          </div>

          <form className="auth-card" onSubmit={(event) => event.preventDefault()}>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="name">Name</label>
                <input id="name" placeholder="Your name" />
              </div>
              <div className="form-field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" placeholder="you@example.com" />
              </div>
              <div className="form-field full">
                <label htmlFor="message">How can we help?</label>
                <textarea id="message" placeholder="Share your goals, team size, or coaching needs." />
              </div>
            </div>
            <div className="button-row" style={{ marginTop: "1rem" }}>
              <button type="submit" className="btn btn-primary">
                Send inquiry
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  </>
);
