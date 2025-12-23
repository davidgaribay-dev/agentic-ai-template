/**
 * Team API Keys Settings Page - Redirects to team settings.
 *
 * This page now redirects to the team settings page with the api-keys tab selected.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/org/team/$teamId/api-keys")({
  beforeLoad: ({ context, params }) => {
    if (!context.auth.isAuthenticated && !context.auth.isLoading) {
      throw redirect({ to: "/login" });
    }
    // Redirect to team settings page - api-keys tab is part of the unified settings
    throw redirect({
      to: "/org/team/$teamId/settings",
      params: { teamId: params.teamId },
    });
  },
  component: () => null,
});
