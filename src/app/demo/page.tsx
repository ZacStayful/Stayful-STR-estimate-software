import { redirect } from "next/navigation";

// /demo is a shortcut for "open the analyser with the demo dataset preloaded".
// It now redirects through the gated /estimate route — non-authed visitors
// will be bounced to /login first via proxy.ts.
export default function DemoPage() {
  redirect("/estimate?demo=true");
}
