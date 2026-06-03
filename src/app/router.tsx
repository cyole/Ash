import type { ReactNode } from "react";
import { lazy, Suspense } from "react";
import { createHashRouter } from "react-router";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";

const ExtensionsPage = lazy(() =>
  import("@/features/extensions/ExtensionsPage").then(({ ExtensionsPage }) => ({ default: ExtensionsPage })),
);
const ChatPage = lazy(() => import("@/features/chat/ChatPage").then(({ ChatPage }) => ({ default: ChatPage })));
const FilesPage = lazy(() => import("@/features/files/FilesPage").then(({ FilesPage }) => ({ default: FilesPage })));
const HomePage = lazy(() => import("@/features/home/HomePage").then(({ HomePage }) => ({ default: HomePage })));
const JobsPage = lazy(() => import("@/features/jobs/JobsPage").then(({ JobsPage }) => ({ default: JobsPage })));
const ModelsPage = lazy(() => import("@/features/models/ModelsPage").then(({ ModelsPage }) => ({ default: ModelsPage })));
const OnboardingPage = lazy(() =>
  import("@/features/onboarding/OnboardingPage").then(({ OnboardingPage }) => ({ default: OnboardingPage })),
);
const SettingsPage = lazy(() =>
  import("@/features/settings/SettingsPage").then(({ SettingsPage }) => ({ default: SettingsPage })),
);
const TasksPage = lazy(() => import("@/features/tasks/TasksPage").then(({ TasksPage }) => ({ default: TasksPage })));

export const router = createHashRouter([
  {
    path: "/onboarding",
    element: routeElement(<OnboardingPage />),
  },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: routeElement(<HomePage />) },
      { path: "chat", element: routeElement(<ChatPage />) },
      { path: "tasks", element: routeElement(<TasksPage />) },
      { path: "jobs", element: routeElement(<JobsPage />) },
      { path: "files", element: routeElement(<FilesPage />) },
      { path: "models", element: routeElement(<ModelsPage />) },
      { path: "extensions", element: routeElement(<ExtensionsPage />) },
      { path: "settings", element: routeElement(<SettingsPage />) },
    ],
  },
]);

function routeElement(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

function RouteFallback() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="sr-only">正在加载页面</span>
    </div>
  );
}
