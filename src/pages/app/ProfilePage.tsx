import { UserProfileView } from "@/components/profile/UserProfileView";
import { useAuth } from "@/features/auth/AuthContext";

export const ProfilePage = () => {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return null;
  }

  return <UserProfileView userId={currentUser.id} isOwnProfile />;
};
