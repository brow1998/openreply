import { permanentRedirect } from "next/navigation";

// Moved under Settings; old links and bookmarks keep working.
export default function Page() {
  permanentRedirect("/settings/diagnostics");
}
