import { createBrowserRouter } from "react-router-dom";
import LoginPage from "@/shared/auth/LoginPage";
import { HomeRedirect, RequireAuth } from "@/shared/auth/RequireAuth";
import { AppLayout } from "@/shared/layout/AppLayout";
import RouteErrorPage from "@/shared/pages/RouteErrorPage";

/**
 * Route table. Every page is a lazy default export so a feature only owns its own folder.
 * Optional segments (`:contractId?`) let a nav entry open the page without picking a record first;
 * the page then falls back to the first record that needs the signed-in user's attention.
 *
 * Signed-in pages render inside `AppLayout`, which stays mounted across navigation; the inner
 * pathless route catches page errors so the sidebar and header remain usable.
 */
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage />, errorElement: <RouteErrorPage /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    HydrateFallback: () => null,
    children: [
      {
        element: <AppLayout />,
        children: [{ errorElement: <RouteErrorPage />, children: pages() }],
      },
    ],
  },
]);

function pages() {
  return [
    { path: "/", element: <HomeRedirect /> },

    {
      path: "/platform/permissions",
      lazy: () =>
        import("@/features/platform/PermissionMatrixPage").then(asRoute),
    },
    {
      path: "/platform/:resource?",
      lazy: () => import("@/features/platform/ResourcePage").then(asRoute),
    },
    {
      path: "/data",
      lazy: () => import("@/features/platform/DataPage").then(asRoute),
    },
    // Contracts (A1, A2, C1)
    {
      path: "/contracts",
      lazy: () =>
        import("@/features/contracts/pages/ContractListPage").then(asRoute),
    },
    {
      path: "/contracts/new",
      lazy: () =>
        import("@/features/contracts/pages/ContractUploadPage").then(asRoute),
    },
    {
      path: "/contracts/:contractId",
      lazy: () =>
        import("@/features/milestones/pages/ContractDetailPage").then(asRoute),
    },

    // Signing (A3-A7)
    {
      path: "/contracts/:contractId/sign-positions",
      lazy: () =>
        import("@/features/signing/pages/SignaturePositionsPage").then(asRoute),
    },
    {
      path: "/contracts/:contractId/digitize",
      lazy: () =>
        import("@/features/signing/pages/DigitizeReviewPage").then(asRoute),
    },
    {
      path: "/contracts/:contractId/signing",
      lazy: () =>
        import("@/features/signing/pages/SigningFlowPage").then(asRoute),
    },
    {
      path: "/contracts/:contractId/signing/:stepNo",
      lazy: () =>
        import("@/features/signing/pages/SigningMethodPage").then(asRoute),
    },
    {
      path: "/verify/:contractId?",
      lazy: () =>
        import("@/features/signing/pages/SignatureVerificationPage").then(
          asRoute,
        ),
    },

    // Milestones (B1-B4)
    {
      path: "/tasks",
      lazy: () =>
        import("@/features/milestones/pages/TaskInboxPage").then(asRoute),
    },
    {
      path: "/submissions/:contractId?/:milestoneNo?",
      lazy: () =>
        import("@/features/milestones/pages/EvidenceSubmissionPage").then(
          asRoute,
        ),
    },
    {
      path: "/approvals/:contractId?/:milestoneNo?",
      lazy: () =>
        import("@/features/milestones/pages/PaymentApprovalPage").then(asRoute),
    },
    {
      path: "/contracts/:contractId/milestones/:milestoneNo/decision",
      lazy: () =>
        import("@/features/milestones/pages/MilestoneDecisionPage").then(
          asRoute,
        ),
    },

    // Disputes and audit (C2, C3)
    {
      path: "/contracts/:contractId/milestones/:milestoneNo/dispute",
      lazy: () => import("@/features/disputes/pages/DisputePage").then(asRoute),
    },
    {
      path: "/exceptions",
      lazy: () =>
        import("@/features/audit/pages/ExceptionQueuePage").then(asRoute),
    },
    {
      path: "/integrity",
      lazy: () => import("@/features/audit/pages/IntegrityPage").then(asRoute),
    },
    {
      path: "/activity-log",
      lazy: () =>
        import("@/features/audit/pages/ActivityLogPage").then(asRoute),
    },

    {
      path: "*",
      lazy: () => import("@/shared/pages/NotFoundPage").then(asRoute),
    },
  ];
}

function asRoute(module: { default: React.ComponentType }) {
  return { Component: module.default };
}
