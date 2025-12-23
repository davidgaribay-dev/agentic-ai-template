import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { FileSearch } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DocumentList } from "@/components/documents/document-list";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/org/team/$teamId/documents")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated && !context.auth.isLoading) {
      throw redirect({ to: "/login" });
    }
  },
  component: DocumentsPage,
});

function DocumentsPage() {
  const { currentOrg, teams } = useWorkspace();
  const { teamId } = Route.useParams();
  const [activeTab, setActiveTab] = useState("all");

  const team = teams.find((t) => t.id === teamId);

  if (!currentOrg || !team) {
    return (
      <div className="bg-background min-h-screen">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-muted-foreground">Team not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FileSearch className="h-6 w-6" />
            <h1 className="text-3xl font-bold">Documents</h1>
          </div>
          <p className="text-muted-foreground">
            Upload and manage documents for AI-powered search in your
            conversations
          </p>
          <p className="text-xs text-muted-foreground">Team: {team.name}</p>
        </div>

        <DocumentUpload
          orgId={currentOrg.id}
          teamId={team.id}
          defaultScope="team"
        />

        <div>
          <h2 className="text-xl font-semibold mb-4">Your Documents</h2>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList variant="underline">
              <TabsTrigger variant="underline" value="all">
                All
              </TabsTrigger>
              <TabsTrigger variant="underline" value="completed">
                Ready
              </TabsTrigger>
              <TabsTrigger variant="underline" value="processing">
                Processing
              </TabsTrigger>
              <TabsTrigger variant="underline" value="failed">
                Failed
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-6">
              <DocumentList orgId={currentOrg.id} teamId={team.id} />
            </TabsContent>

            <TabsContent value="completed" className="mt-6">
              <DocumentList
                orgId={currentOrg.id}
                teamId={team.id}
                status="completed"
              />
            </TabsContent>

            <TabsContent value="processing" className="mt-6">
              <DocumentList
                orgId={currentOrg.id}
                teamId={team.id}
                status="processing"
              />
            </TabsContent>

            <TabsContent value="failed" className="mt-6">
              <DocumentList
                orgId={currentOrg.id}
                teamId={team.id}
                status="failed"
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
