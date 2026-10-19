import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export const googleKey = import.meta.env.VITE_GOOGLE_MAPS_KEY as
  string | undefined;
export async function api(action: string, payload: unknown) {
  if (!supabase)
    throw new Error(
      "Connect Supabase and sign in to use protected live integrations.",
    );
  const { data, error } = await supabase.functions.invoke("travel-api", {
    body: { action, ...(payload as object) },
  });
  if (error) {
    let message = data?.error;
    if (
      !message &&
      ["geocode", "autocomplete"].includes(action) &&
      error.context instanceof Response
    ) {
      try {
        message = (await error.context.clone().json()).error;
      } catch {
        /* Keep the transport message. */
      }
    }
    throw new Error(message || error.message);
  }
  if (data.error) throw new Error(data.error);
  return data;
}
let loader: Promise<void> | undefined;
export function loadGoogle() {
  if (!googleKey)
    return Promise.reject(new Error("Google Maps key is not configured"));
  if (!loader)
    loader = new Promise<void>((resolve, reject) => {
      if (window.google?.maps) return resolve();
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleKey)}&libraries=places,geometry&loading=async&callback=wayfarerMapsReady`;
      (window as unknown as Record<string, unknown>).wayfarerMapsReady =
        resolve;
      script.onerror = () => reject(new Error("Google Maps failed to load"));
      document.head.append(script);
      setTimeout(() => {
        if (!window.google?.maps)
          reject(
            new Error(
              "Google Maps unavailable. Check key restrictions and enabled APIs.",
            ),
          );
      }, 15000);
    });
  return loader;
}
