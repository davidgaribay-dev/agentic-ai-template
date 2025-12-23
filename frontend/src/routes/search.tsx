import { createFileRoute } from "@tanstack/react-router"
import { SearchConversations } from "@/components/search-conversations"

export const Route = createFileRoute("/search")({
  component: SearchPage,
})

function SearchPage() {
  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Chats</h1>
      </div>
      <SearchConversations />
    </div>
  )
}
