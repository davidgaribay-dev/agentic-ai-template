import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { SearchConversations } from "@/components/search-conversations";

export const Route = createFileRoute("/search")({
  component: SearchPage,
});

function SearchPage() {
  const { t } = useTranslation();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-4 md:py-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">{t("nav_chats")}</h1>
      </div>
      <SearchConversations />
    </div>
  );
}
