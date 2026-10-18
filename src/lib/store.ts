import { useEffect, useRef, useState } from "react";
import { supabase } from "./api";
import { seedTrip } from "./seed";
import type { Trip } from "./model";
const LOCAL = "wayfarer-v1";
export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL);
      return raw ? JSON.parse(raw) : [seedTrip()];
    } catch {
      return [seedTrip()];
    }
  });
  const [status, setStatus] = useState("Saved on this device");
  const [user, setUser] = useState<string>();
  const [ready, setReady] = useState(false);
  const versions = useRef<Record<string, number>>({});
  const original = useRef<Record<string, string>>({});
  const saving = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    if (!supabase) return;
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        generation.current++;
        setReady(false);
        try {
          setTrips(JSON.parse(localStorage.getItem(LOCAL) ?? "[]"));
        } catch {
          setTrips([]);
        }
      }
      setUser((previous) => {
        if (previous !== session?.user.id) setReady(false);
        return session?.user.id;
      });
    });
    supabase.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user.id));
    return () => sub.data.subscription.unsubscribe();
  }, []);
  async function reload() {
    if (!supabase || !user) return;
    generation.current++;
    while (saving.current) await new Promise((r) => setTimeout(r, 100));
    const { data, error } = await supabase
      .from("trips")
      .select("id,data,version");
    if (error) {
      setStatus("Cloud error: " + error.message);
      return;
    }
    if (data?.length) {
      versions.current = Object.fromEntries(data.map((d) => [d.id, d.version]));
      original.current = Object.fromEntries(
        data.map((d) => [d.id, JSON.stringify(d.data)]),
      );
      setTrips(data.map((d) => d.data as Trip));
    } else {
      versions.current = {};
      original.current = {};
    }
    setReady(true);
    setStatus("Cloud connected");
  }
  useEffect(() => {
    if (user) void reload();
  }, [user]);
  useEffect(() => {
    if (!user) {
      try {
        localStorage.setItem(LOCAL, JSON.stringify(trips));
        setStatus("Saved on this device");
      } catch {
        setStatus("Storage full — export a backup now");
      }
      return;
    }
    if (!ready) return;
    setStatus("Unsaved changes");
    const currentGeneration = generation.current;
    const timer = setTimeout(async () => {
      while (saving.current) await new Promise((r) => setTimeout(r, 100));
      if (currentGeneration !== generation.current) return;
      saving.current = true;
      try {
        for (const trip of trips) {
          if (original.current[trip.id] === JSON.stringify(trip)) continue;
          const { data, error } = await supabase!.rpc("save_trip", {
            p_id: trip.id,
            p_data: trip,
            p_version: versions.current[trip.id] ?? 0,
          });
          if (error) throw error;
          versions.current[trip.id] = data;
          original.current[trip.id] = JSON.stringify(trip);
        }
        setStatus("Saved to cloud");
      } catch (e) {
        setStatus(
          "Save failed. Export a backup, then reload cloud: " +
            (e as Error).message,
        );
      } finally {
        saving.current = false;
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [trips, user, ready]);
  return { trips, setTrips, status, user, reload };
}
