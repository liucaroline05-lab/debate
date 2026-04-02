import { PageMeta } from "@/components/common/PageMeta";
import { channels, posts } from "@/data/mockData";
import { useFirebaseCollection } from "@/hooks/useFirebaseCollection";
import { formatDateTime } from "@/lib/date";

export const CommunityPage = () => {
  const channelState = useFirebaseCollection("channels", channels);
  const postState = useFirebaseCollection("posts", posts);

  return (
    <>
      <PageMeta
        title="Community"
        description="Follow community channels, join discussions, and share practice reflections."
      />
      <header className="route-header">
        <p className="eyebrow">Community</p>
        <h1>Keep the team conversation alive between rounds.</h1>
        <p>
          Follow channels, post updates, reply to reflections, and reserve space
          for moderation actions as the platform grows.
        </p>
      </header>

      <section className="community-grid" style={{ marginBottom: "1.5rem" }}>
        {channelState.data.map((channel) => (
          <article key={channel.id} className="community-card">
            <span className="pill">{channel.followers} followers</span>
            <h3 className="card-title" style={{ marginTop: "0.9rem", fontSize: "1.45rem" }}>
              {channel.name}
            </h3>
            <p className="card-copy">{channel.summary}</p>
            <div className="pill-row" style={{ marginTop: "1rem" }}>
              {channel.topicTags.map((tag) => (
                <span key={tag} className="pill">
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="stack">
        {postState.data.map((post) => (
          <article key={post.id} className="app-card">
            <div className="row-between">
              <div>
                <span className="pill">{post.author}</span>
                <h2 className="card-title" style={{ marginTop: "0.7rem" }}>
                  Community post
                </h2>
              </div>
              <span className="meta-line">{formatDateTime(post.createdAt)}</span>
            </div>
            <p className="card-copy">{post.content}</p>
            <div className="pill-row">
              <span className="pill">{post.replyCount} replies</span>
              <span className="pill">{post.reported ? "Reported" : "Clear"}</span>
            </div>
          </article>
        ))}
      </section>
    </>
  );
};
