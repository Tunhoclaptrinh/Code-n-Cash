import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SigningMethodPage from "./SigningMethodPage";

const api = vi.hoisted(() => ({ overview: vi.fn(), request: vi.fn() }));
vi.mock("@/shared/auth/session", () => ({
  useCurrentUser: () => ({ id: "signer" }),
}));
vi.mock("@/shared/layout/AppPage", () => ({
  AppPage: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../api/signingConfig.api", async (original) => ({
  ...(await original<object>()),
  getSigningOverview: api.overview,
}));
vi.mock("../api/signingFlow.api", async (original) => ({
  ...(await original<object>()),
  getSigningRequest: api.request,
}));
vi.mock("../device/deviceApi", async (original) => ({
  ...(await original<object>()),
  getDeviceSession: async () => {
    throw new Error("SIGNER_DISABLED");
  },
}));

beforeEach(() => {
  api.request.mockResolvedValue({ remote: true, status: "PENDING" });
});

function open(myStepNo: number) {
  api.overview.mockResolvedValue({
    steps: [{ stepNo: 2, status: "SIGNED" }],
    myStepNo,
    lastMethod: "USB_TOKEN",
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/contracts/CT0102/signing/2"]}>
        <Routes>
          <Route
            path="/contracts/:contractId/signing/:stepNo"
            element={<SigningMethodPage />}
          />
          <Route
            path="/verify/:contractId"
            element={<p>Verification route</p>}
          />
          <Route
            path="/contracts/:contractId/signing"
            element={<p>Sequence route</p>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("opens verification when the webhook marks my step signed before polling completes", async () => {
  open(2);
  expect(await screen.findByText("Verification route")).toBeTruthy();
});

it("returns to the sequence when the signed step belongs to another signer", async () => {
  open(1);
  expect(await screen.findByText("Sequence route")).toBeTruthy();
});
