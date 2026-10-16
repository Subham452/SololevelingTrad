import { useCallback, useState } from "react";
import { MeetingProvider } from "@videosdk.live/react-sdk";
import { useAuth } from "../context/useAuth.js";

// Drives the authorized join flow: call the backend (which checks access and
// mints a scoped VideoSDK token) then hand back a MeetingProvider-ready config.
// The token NEVER originates on the client; role/permissions are server-derived.
export function useAuthorizedMeeting() {
  const { user } = useAuth();
  const [state, setState] = useState({ status: "idle", error: null, token: null, roomId: null, role: null, config: null });

  // joinFn must resolve to { token, roomId, role, participantId }
  const join = useCallback(async (joinFn) => {
    setState((s) => ({ ...s, status: "connecting", error: null }));
    try {
      const { token, roomId, role, participantId } = await joinFn();
      const config = {
        meetingId: roomId,
        name: user?.username || user?.firstName || "Guest",
        participantId: participantId || String(user?._id || user?.id || "guest"),
        micEnabled: true,
        webcamEnabled: true,
        debugMode: false,
      };
      setState({ status: "joined", error: null, token, roomId, role, config });
      return { token, roomId, role };
    } catch (e) {
      setState((s) => ({ ...s, status: "error", error: e?.message || "Failed to join" }));
      throw e;
    }
  }, [user]);

  const reset = useCallback(() => {
    setState({ status: "idle", error: null, token: null, roomId: null, role: null, config: null });
  }, []);

  // Wrap children in the provider once we have a token + config.
  const Provider = ({ children }) => {
    if (state.status !== "joined" || !state.config || !state.token) return children;
    return (
      <MeetingProvider config={state.config} token={state.token} joinWithoutUserInteraction>
        {children}
      </MeetingProvider>
    );
  };

  return { ...state, join, reset, Provider };
}
