import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { currentOrg, teams } = useWorkspace();
  const { teamId } = Route.useParams();
  const [activeTab, setActiveTab] = useState("all");

  const team = teams.find((t) => t.id === teamId);

  if (!currentOrg || !team) {
    return (
      <div className="bg-background min-h-screen">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-muted-foreground">{t("docs_team_not_found")}</p>
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
            <h1 className="text-3xl font-bold">{t("docs_title")}</h1>
          </div>
          <p className="text-muted-foreground">
            {t("docs_upload_manage_desc")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("com_team")}: {team.name}
          </p>
        </div>

        <DocumentUpload
          orgId={currentOrg.id}
          teamId={team.id}
          defaultScope="team"
        />

        <div>
          <h2 className="text-xl font-semibold mb-4">
            {t("docs_your_documents")}
          </h2>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList variant="underline">
              <TabsTrigger variant="underline" value="all">
                {t("docs_tab_all")}
              </TabsTrigger>
              <TabsTrigger variant="underline" value="completed">
                {t("docs_status_ready")}
              </TabsTrigger>
              <TabsTrigger variant="underline" value="processing">
                {t("docs_status_processing")}
              </TabsTrigger>
              <TabsTrigger variant="underline" value="failed">
                {t("docs_status_failed")}
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
