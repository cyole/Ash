import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { AppProviders } from "@/app/providers";
import { router } from "@/app/router";

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors />
    </AppProviders>
  );
}

