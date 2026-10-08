"use client";
import { useEffect, useState, type ReactNode } from "react";
export function ScrollLink({ target, children, className, accountIntent, label }: { target: string; children: ReactNode; className?: string; accountIntent?: "auth" | "history"; label?: string }) {
  const [accountName, setAccountName] = useState("");
  useEffect(() => {
    if (window.location.hash && ["#top", "#method", "#intake", "#deeper"].includes(window.location.hash)) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    const update = (event: Event) => { const data = (event as CustomEvent).detail; setAccountName(data.signedIn ? data.displayName : ""); };
    window.addEventListener("sijing-account-state", update); return () => window.removeEventListener("sijing-account-state", update);
  }, []);
  return <a href={`#${target}`} className={className} aria-label={label} onClick={event => {
    event.preventDefault(); document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (accountIntent) window.dispatchEvent(new CustomEvent("sijing-account-open", { detail: accountIntent }));
  }}>{accountIntent === "auth" && accountName ? "我的账户" : children}</a>;
}
