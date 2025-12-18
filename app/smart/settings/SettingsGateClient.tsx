"use client";

import React, { useEffect, useMemo, useState } from "react";

const SESSION_KEY = "teamoptix_settings_unlocked";

function getGateKey() {
  // Must be NEXT_PUBLIC because this runs in the browser
  return process.env.NEXT_PUBLIC_SETTINGS_GATEKEY ?? "";
}

function isUnlocked() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function setUnlocked() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // ignore
  }
}

export function promptForSettingsAccess(): boolean {
  const gate = getGateKey().trim();
  if (!gate) {
    // If no gatekey configured, do NOT block (safe for dev).
    return true;
  }

  if (isUnlocked()) return true;

  const entered = window.prompt("Enter Settings access key:");
  if (!entered) return false;

  if (entered.trim() === gate) {
    setUnlocked();
    return true;
  }

  window.alert("Invalid access key.");
  return false;
}

/**
 * Wrap Settings page content with this to block direct URL access.
 */
export default function SettingsGateClient({
  children,
  redirectTo = "/smart",
}: {
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const hasGate = useMemo(() => !!getGateKey().trim(), []);

  useEffect(() => {
    // No gate configured => allow
    if (!hasGate) {
      setAllowed(true);
      return;
    }

    if (isUnlocked()) {
      setAllowed(true);
      return;
    }

    const ok = promptForSettingsAccess();
    setAllowed(ok);

    if (!ok) {
      // send user away if they fail
      window.location.href = redirectTo;
    }
  }, [hasGate, redirectTo]);

  if (allowed === null) {
    return (
      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 16 }}>
        <div style={{ fontWeight: 900 }}>Checking access…</div>
        <div style={{ opacity: 0.8, marginTop: 6 }}>Please wait.</div>
      </div>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}
