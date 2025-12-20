/**
 * Team Prompts Page - Redirects to team settings.
 *
 * This page now redirects to the team settings page with the prompts tabs.
 */

import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/org/team/$teamId/prompts")({
  beforeLoad: ({ context, params }) => {
    if (!context.auth.isAuthenticated && !context.auth.isLoading) {
      throw redirect({ to: "/login" })
    }
    // Redirect to team settings page - prompts are part of the unified settings
    throw redirect({ to: "/org/team/$teamId/settings", params: { teamId: params.teamId } })
  },
  component: () => null,
})
