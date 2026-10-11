import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { apiError } from "../../services/api";

const NPD_BASE_PATH = "/npd";

// Where people sign in (the OIPM workspace). No separate NPD error page:
// anyone without a valid session goes straight back there.
const WORKSPACE_URL = import.meta.env.VITE_WORKSPACE_URL ?? "http://nibl";

function backToWorkspace(message?: string) {
  const base = WORKSPACE_URL.replace(/\/+$/, "");
  // The workspace shows "#npd_denied=<message>" as its access pop-up.
  const hash = message ? `#npd_denied=${encodeURIComponent(message)}` : "";
  window.location.replace(`${base}/${hash}`);
}

// The portal session (same site, so NPD can read it directly - no token in the URL).
// "#oipm_token=" in the URL still works for old links / bookmarks.
function readOipmToken() {
  const hash = window.location.hash.replace(/^#/, "");
  const fromHash = new URLSearchParams(hash).get("oipm_token");
  if (fromHash) return fromHash;
  try {
    return window.localStorage.getItem("portal_access_token") ?? "";
  } catch {
    return "";
  }
}

export default function Sso() {
  const { user, loading, loginWithOipm } = useAuth();

  const [processing, setProcessing] = useState(false);

  const startedRef = useRef(false);

  useEffect(() => {
    if (user || startedRef.current) {
      return;
    }

    const oipmToken = readOipmToken();

    if (!oipmToken) {
      if (!loading) {
        backToWorkspace();
      }
      return;
    }

    if (loading) {
      return;
    }

    startedRef.current = true;
    setProcessing(true);

    /*
     * Do NOT remove the token from the URL until the NPD
     * authentication succeeds. This makes the SSO flow
     * recoverable and prevents the token from disappearing
     * before authentication is complete.
     */
    loginWithOipm(oipmToken)
      .then(() => {
        window.history.replaceState(
          null,
          "",
          `${NPD_BASE_PATH}/sso`,
        );

        window.location.replace(
          `${NPD_BASE_PATH}/dashboard`,
        );
      })
      .catch((err) => {
        console.error("NPD SSO authentication failed:", err);

        backToWorkspace(
          apiError(
            err,
            "NPD authentication failed. Please try opening NPD again.",
          ),
        );
      });
  }, [loginWithOipm, user, loading]);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  if (processing || loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, sans-serif",
          background: "#f7f7f7",
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "32px",
          }}
        >
          <h2 style={{ marginBottom: "10px" }}>
            Signing you into NPD...
          </h2>

          <p style={{ color: "#666" }}>
            Please wait while we verify your NPD session.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

