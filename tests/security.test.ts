import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111",
  partner = "22222222-2222-4222-8222-222222222222",
  outsider = "33333333-3333-4333-8333-333333333333",
  trip = "44444444-4444-4444-8444-444444444444";
async function asUser(id: string, email: string) {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [id, JSON.stringify({ email })],
  );
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  await db.exec(
    `create schema auth;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;`,
  );
  await db.exec(
    readFileSync("supabase/migrations/001_initial.sql", "utf8").replace(
      "create extension if not exists pgcrypto;",
      "",
    ),
  );
  await db.exec(readFileSync("supabase/migrations/002_geocoding.sql", "utf8"));
  await db.query("insert into auth.users values ($1),($2),($3)", [
    owner,
    partner,
    outsider,
  ]);
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("private trip authorization and concurrent updates", () => {
  it("creates a private trip and rejects stale writes", async () => {
    await asUser(owner, "owner@example.com");
    expect(
      (
        await db.query<{ save_trip: number }>(
          "select public.save_trip($1,$2,0)",
          [trip, JSON.stringify({ id: trip, name: "Osaka" })],
        )
      ).rows[0].save_trip,
    ).toBe(1);
    await db.query("select public.save_trip($1,$2,1)", [
      trip,
      JSON.stringify({ id: trip, name: "Updated Osaka" }),
    ]);
    await expect(
      db.query("select public.save_trip($1,$2,1)", [
        trip,
        JSON.stringify({ id: trip }),
      ]),
    ).rejects.toThrow(/Another traveler/);
  });
  it("hides the trip and denies writes for outsiders", async () => {
    await asUser(outsider, "stranger@example.com");
    expect((await db.query("select * from public.trips")).rows).toHaveLength(0);
    await expect(
      db.query("select public.save_trip($1,$2,2)", [
        trip,
        JSON.stringify({ id: trip }),
      ]),
    ).rejects.toThrow(/Access denied/);
    await expect(
      db.query("update public.trips set owner_id=$1", [outsider]),
    ).rejects.toThrow(/permission denied/);
  });
  it("binds invitations to email and grants collaboration, not ownership", async () => {
    await asUser(owner, "owner@example.com");
    const { rows } = await db.query<{ invite_trip: string }>(
      "select public.invite_trip($1,$2)",
      [trip, "partner@example.com"],
    );
    await asUser(outsider, "stranger@example.com");
    await expect(
      db.query("select public.accept_invite($1)", [rows[0].invite_trip]),
    ).rejects.toThrow(/different-email/);
    await asUser(partner, "partner@example.com");
    await db.query("select public.accept_invite($1)", [rows[0].invite_trip]);
    expect((await db.query("select * from public.trips")).rows).toHaveLength(1);
    await db.query("select public.save_trip($1,$2,2)", [
      trip,
      JSON.stringify({ id: trip, name: "Shared Osaka" }),
    ]);
    expect(
      (await db.query("delete from public.trips returning id")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.invite_trip($1,$2)", [
        trip,
        "someone@example.com",
      ]),
    ).rejects.toThrow(/Only the owner/);
  });
  it("denies client access to monitoring budget functions", async () => {
    await expect(
      db.query("select public.consume_request('x',1000,1)"),
    ).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from private.invitations")).rejects.toThrow(
      /permission denied/,
    );
  });
  it("enforces atomic request budgets for the service role", async () => {
    await db.exec("reset role;set role service_role");
    expect(
      (
        await db.query<{ consume_request: boolean }>(
          "select public.consume_request('test',1,60)",
        )
      ).rows[0].consume_request,
    ).toBe(true);
    expect(
      (
        await db.query<{ consume_request: boolean }>(
          "select public.consume_request('test',1,60)",
        )
      ).rows[0].consume_request,
    ).toBe(false);
  });
});

it("denies direct browser access to geocoding cache", async () => {
  await asUser(owner, "owner@example.com");
  await expect(
    db.query("select * from public.geocode_cache"),
  ).rejects.toThrow();
});
