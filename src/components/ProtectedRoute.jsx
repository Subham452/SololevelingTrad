import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth.js";

export default function ProtectedRoute({ children, requireAdmin = false, requireStaff = false }) {
  const { authenticated, isAdmin, isStaff, loading } = useAuth();
  const loc = useLocation();
  if (loading) return null;
  if (!authenticated) return <Navigate to="/login" replace state={{ from: loc.pathname, toast: "Please log in to continue." }} />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace state={{ toast: "Admins only." }} />;
  if (requireStaff && !isStaff) return <Navigate to="/" replace state={{ toast: "Staff access required." }} />;
  return children;
}
