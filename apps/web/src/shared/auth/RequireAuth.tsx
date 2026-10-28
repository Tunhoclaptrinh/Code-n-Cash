import { Navigate, Outlet, useLocation } from "react-router-dom";
import { homeByRole, routeAllowed } from "../layout/navConfig";
import { useSession } from "./session";

/** Gate for every route except the sign-in page; a screen the role may not open leads home. */
export function RequireAuth() {
  const { user, restoring } = useSession();
  const location = useLocation();

  if (restoring) return null;
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!routeAllowed(location.pathname, user.permissions))
    return <Navigate to={homeByRole[user.role]} replace />;
  return <Outlet />;
}

/** `/` sends each role to its own landing screen. */
export function HomeRedirect() {
  const { user } = useSession();
  return <Navigate to={user ? homeByRole[user.role] : "/login"} replace />;
}
