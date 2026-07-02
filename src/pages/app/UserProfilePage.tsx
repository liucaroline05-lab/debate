import { useParams } from "react-router-dom";
import { UserProfileView } from "@/components/profile/UserProfileView";
import { useAuth } from "@/features/auth/AuthContext";

export const UserProfilePage = () => {
  const { userId } = useParams();
  const { currentUser } = useAuth();

  if (!userId) {
    return (
      <section className="empty-state">
        <h2 className="card-title">User not found</h2>
      </section>
    );
  }

  return <UserProfileView userId={userId} isOwnProfile={currentUser?.id === userId} />;
};
