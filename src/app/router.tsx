import { createHashRouter } from "react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { ChatPage } from "@/features/chat/ChatPage";
import { ExtensionsPage } from "@/features/extensions/ExtensionsPage";
import { FilesPage } from "@/features/files/FilesPage";
import { HomePage } from "@/features/home/HomePage";
import { JobsPage } from "@/features/jobs/JobsPage";
import { ModelsPage } from "@/features/models/ModelsPage";
import { OnboardingPage } from "@/features/onboarding/OnboardingPage";
import { SessionsPage } from "@/features/sessions/SessionsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { TasksPage } from "@/features/tasks/TasksPage";

export const router = createHashRouter([
  {
    path: "/onboarding",
    element: <OnboardingPage />,
  },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "chat", element: <ChatPage /> },
      { path: "sessions", element: <SessionsPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "jobs", element: <JobsPage /> },
      { path: "files", element: <FilesPage /> },
      { path: "models", element: <ModelsPage /> },
      { path: "extensions", element: <ExtensionsPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
