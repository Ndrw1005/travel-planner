import { useState } from "react";
import { supabase, googleKey, api } from "../lib/api";
import type { Trip } from "../lib/model";
export default function Integrations({
  trip,
  user,
  reload,
}: {
  trip: Trip;
  user?: string;
  reload: () => Promise<void>;
}) {
  const [email, setEmail] = useState(""),
    [invite, setInvite] = useState(""),
    [token, setToken] = useState(""),
    [message, setMessage] = useState(""),
    [status, setStatus] = useState<Record<string, boolean>>();
  async function login() {
    if (!supabase) {
      setMessage(
        "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.",
      );
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL },
    });
    setMessage(
      error ? error.message : "Sign-in link sent. Open it on this device.",
    );
  }
  async function createInvite() {
    if (!supabase || !user) {
      setMessage("Connect Supabase and sign in first.");
      return;
    }
    const { data, error } = await supabase.rpc("invite_trip", {
      p_trip: trip.id,
      p_email: invite.toLowerCase().trim(),
    });
    setMessage(
      error
        ? error.message
        : `Share this invitation token privately with ${invite}: ${data}. They must sign in with that email and accept it below. Expires in seven days.`,
    );
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE, CONNECTED</span>
          <h2>Integrations & sharing</h2>
        </div>
        <button
          onClick={async () => {
            try {
              setStatus(await api("status", {}));
              setMessage(
                "Backend configuration checked. Provider reachability has not been tested.",
              );
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Check backend setup
        </button>
      </div>
      <div className="integration-grid">
        {[
          [
            "Local storage",
            true,
            "Plans persist in this browser. Export backups before clearing browsing data.",
          ],
          [
            "Google Maps",
            !!googleKey,
            "Public restricted key required. Places IDs can be saved; provider responses are not persisted.",
          ],
          [
            "Supabase",
            !!supabase,
            "Authentication, private shared trips, observations and alerts.",
          ],
          [
            "Google Routes",
            status?.routes,
            "Protected server key and enabled Routes API required.",
          ],
          [
            "SerpApi pricing",
            status?.pricing,
            "Protected API key, quota and scheduled function required.",
          ],
          [
            "Weather & exchange rates",
            true,
            "Key-free services. Availability is verified when you request data.",
          ],
        ].map(([name, enabled, description]) => (
          <div className="panel" key={String(name)}>
            <span className={`status-dot ${enabled ? "on" : ""}`} />
            <h3>{name}</h3>
            <span className="badge">
              {enabled
                ? "Configured"
                : enabled === false
                  ? "Setup required"
                  : "Backend not checked"}
            </span>
            <p>{description}</p>
          </div>
        ))}
      </div>
      <div className="two-col">
        <div className="panel">
          <h3>{user ? "Signed in" : "Sign in to sync your plans"}</h3>
          {user ? (
            <div className="row">
              <button
                onClick={async () => {
                  await reload();
                  setMessage("Cloud reloaded.");
                }}
              >
                Reload shared trips
              </button>
              <button
                onClick={async () => {
                  await supabase?.auth.signOut();
                  location.reload();
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void login();
              }}
            >
              <label>
                Email address
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button className="primary">Send sign-in link</button>
            </form>
          )}
          <p className="muted">
            Your first cloud save imports the local trip if your account has no
            trips. Existing cloud trips replace the local view when you sign in.
            Export your local data first if needed.
          </p>
        </div>
        <div className="panel">
          <h3>Bring your travel partner</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createInvite();
            }}
          >
            <label>
              Partner’s email
              <input
                required
                type="email"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
              />
            </label>
            <button className="primary">Create invitation token</button>
          </form>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!supabase) {
                setMessage("Supabase is not configured.");
                return;
              }
              const { error } = await supabase.rpc("accept_invite", {
                p_token: token.trim(),
              });
              setMessage(error ? error.message : "Invitation accepted.");
              if (!error) await reload();
            }}
          >
            <label>
              Have an invitation token?
              <input
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <button>Join shared trip</button>
          </form>
        </div>
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="panel">
        <h3>Data & service terms</h3>
        <p>
          This personal planning app does not sell tickets or guarantee
          availability. Verify transport schedules, entry requirements and
          booking conditions with the original source. Local records stay in
          this browser; signed-in records are stored in your configured Supabase
          project and shared with invited members. Maps and search requests are
          sent to Google; price searches are sent through your backend to
          SerpApi. No payment details are collected.
        </p>
        <p>
          Google Maps use is subject to{" "}
          <a
            href="https://maps.google.com/help/terms_maps/"
            target="_blank"
            rel="noreferrer"
          >
            Google Maps terms
          </a>{" "}
          and{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noreferrer"
          >
            Google’s privacy policy
          </a>
          . OpenStreetMap supplies the unconfigured map. Delete local trips in
          All trips; cloud trip deletion is available to the owner. Configure
          your own privacy contact before inviting others outside your
          household.
        </p>
      </div>
    </>
  );
}
