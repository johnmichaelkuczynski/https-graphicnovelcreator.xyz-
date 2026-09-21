import React, { useEffect } from "react";
import { useRecordVisitor } from "@workspace/api-client-react";

const VISITOR_SESSION_KEY = "gnc:visitor-session-id";

function VisitorCounter() {
  const recordVisitor = useRecordVisitor();

  useEffect(() => {
    let sessionId = sessionStorage.getItem(VISITOR_SESSION_KEY);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(VISITOR_SESSION_KEY, sessionId);
    }

    recordVisitor.mutate({ data: { sessionId } });
    // The generated mutation object is not referentially stable.
    // Counting is server-deduplicated, but this effect should run once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span
      className="whitespace-nowrap border-2 border-border bg-card px-1 py-0.5 text-[9px] sm:text-[10px] font-black uppercase leading-none tracking-tight"
      aria-live="polite"
      title={
        recordVisitor.isError
          ? "The shared visit count could not be loaded"
          : "Browser sessions that have visited Graphic Novel Creator"
      }
    >
      {!recordVisitor.data && !recordVisitor.isError && "Visits …"}
      {recordVisitor.isError && "Visits unavailable"}
      {recordVisitor.data &&
        `${recordVisitor.data.total.toLocaleString()} visits`}
    </span>
  );
}

export function BrandMark() {
  return (
    <div className="flex shrink-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
      <a
        href="https://zhisystems.ai/"
        target="_blank"
        rel="noreferrer"
        aria-label="Visit Zhi Systems"
        title="Visit Zhi Systems"
      >
        <img
          src="/zhi-logo.png"
          alt="Zhi Systems"
          className="w-9 h-9 border-2 border-border brutal-shadow brutal-shadow-hover object-contain bg-white"
        />
      </a>
      <VisitorCounter />
    </div>
  );
}