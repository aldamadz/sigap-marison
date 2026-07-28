import { render, screen } from "@testing-library/react";
import {
  MemoryRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router";

const ProtectedRoute = ({ authenticated }: { authenticated: boolean }) => (
  authenticated ? <Outlet /> : <Navigate to="/login?returnTo=%2Fprivate" replace />
);

const NestedProbe = () => {
  const { workspaceId, itemId } = useParams();
  const [searchParams] = useSearchParams();

  return (
    <p>
      workspace={workspaceId}; item={itemId}; tab={searchParams.get("tab")}
    </p>
  );
};

const LocationProbe = () => {
  const location = useLocation();
  return <p>catch-all={location.pathname}</p>;
};

const renderRouteTree = (initialEntry: string, authenticated: boolean) => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <Routes>
      <Route path="/login" element={<p>login</p>} />
      <Route element={<ProtectedRoute authenticated={authenticated} />}>
        <Route path="/private" element={<p>private</p>} />
        <Route path="/workspace/:workspaceId" element={<Outlet />}>
          <Route path="items/:itemId" element={<NestedProbe />} />
        </Route>
      </Route>
      <Route path="*" element={<LocationProbe />} />
    </Routes>
  </MemoryRouter>,
);

describe("declarative React Router v8 routes", () => {
  it("redirects unauthenticated protected routes", () => {
    renderRouteTree("/private", false);

    expect(screen.getByText("login")).toBeInTheDocument();
    expect(screen.queryByText("private")).not.toBeInTheDocument();
  });

  it("renders nested route params and query strings", () => {
    renderRouteTree("/workspace/finance/items/42?tab=history", true);

    expect(screen.getByText("workspace=finance; item=42; tab=history")).toBeInTheDocument();
  });

  it("renders the catch-all route", () => {
    renderRouteTree("/missing/deep/link", true);

    expect(screen.getByText("catch-all=/missing/deep/link")).toBeInTheDocument();
  });
});
