import { useParams } from "react-router-dom";
import { UserProfileView } from "@/components/profile/UserProfileView";

export const UserProfilePage = () => {
  const { userId } = useParams();

  if (!userId) {
    return (
      <section className="empty-state">
        <h2 className="card-title">User not found</h2>
      </section>
    );
  }

  return <UserProfileView userId={userId} isOwnProfile={false} />;
};
