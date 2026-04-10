import { UserProfileView } from "@/components/profile/UserProfileView";
import { useAuth } from "@/features/auth/AuthContext";

export const ProfilePage = () => {
  const { currentUser } = useAuth();

  return <UserProfileView userId={currentUser?.id ?? "demo-user"} isOwnProfile />;
};
