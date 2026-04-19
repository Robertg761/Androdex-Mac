import { createFileRoute, retainSearchParams } from "@tanstack/react-router";
import { type DiffRouteSearch, parseDiffRouteSearch } from "../diffRouteSearch";
import { resolveThreadRouteRef } from "../threadRoutes";
import { ThreadRouteContainer } from "../features/thread/ThreadRouteContainer";

function ChatThreadRouteView() {
  const threadRef = Route.useParams({
    select: (params) => resolveThreadRouteRef(params),
  });
  const search = Route.useSearch();
  return <ThreadRouteContainer threadRef={threadRef} search={search} />;
}

export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  search: {
    middlewares: [retainSearchParams<DiffRouteSearch>(["diff"])],
  },
  component: ChatThreadRouteView,
});
