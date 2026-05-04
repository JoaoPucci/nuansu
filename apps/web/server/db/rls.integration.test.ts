// End-to-end RLS proof. Five claims:
//
//   1. Connecting as nuansu_app with NO session_proof returns nothing
//      from any user-scoped table.
//   2. Connecting with a VALID proof for user A sees only A's rows;
//      not B's, even though both rows exist.
//   3. SET LOCAL nuansu.session_proof = '<forged>' (no valid HMAC)
//      yields the empty set; RLS silently filters everything out
//      rather than erroring.
//   4. nuansu_app cannot SELECT from auth_users at all (permission
//      denied at the GRANT layer, before RLS has a chance).
//   5. The auth role (nuansu_auth) cannot SELECT from messages
//      (no GRANT) — defends against a leaked auth credential.
//
// These tests are the primary product proof: the entire three-role +
// RLS posture is here. If they pass, the data plane is sound.

import { sql } from "drizzle-orm";
import postgres from "postgres";
import { uuidv7 } from "uuidv7";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeAppPools, forUser } from "./index.js";
import { readTestEnvOrSkip, seedAuthUser, truncateAppData } from "./__test_helpers__/test-db.js";

const env = readTestEnvOrSkip();

const describeIntegration = env ? describe : describe.skip;

beforeEach(async () => {
  if (env) await truncateAppData(env);
});

afterAll(async () => {
  await closeAppPools();
});

async function insertChat(userId: string, name: string): Promise<void> {
  if (!env) throw new Error("env required");
  const id = uuidv7();
  await forUser(
    env.databaseUrl,
    { userId, sessionProofSecret: env.sessionProofSecret },
    async (tx) => {
      await tx.execute(sql`
        INSERT INTO chats (id, user_id, name, target_language)
        VALUES (${id}, ${userId}, ${name}, 'ja')
      `);
    },
  );
}

describeIntegration("RLS — application-table scoping", () => {
  it("chats SELECT returns nothing without a session_proof", async () => {
    if (!env) return;
    const userId = await seedAuthUser(env, { email: "rls-noproof@test.invalid" });
    await insertChat(userId, "rls-noproof-chat");

    // Raw nuansu_app connection that did NOT SET session_proof.
    // Expect zero rows even though the chat exists.
    const raw = postgres(env.databaseUrl, { max: 1 });
    try {
      const rows = await raw`SELECT id FROM chats WHERE user_id = ${userId}`;
      expect(rows).toHaveLength(0);
    } finally {
      await raw.end({ timeout: 1 });
    }
  });

  it("chats SELECT returns own rows only when proof is valid", async () => {
    if (!env) return;
    const userA = await seedAuthUser(env, { email: "a@test.invalid" });
    const userB = await seedAuthUser(env, { email: "b@test.invalid" });
    await insertChat(userA, "A-chat");
    await insertChat(userB, "B-chat");

    const aRows = await forUser(
      env.databaseUrl,
      { userId: userA, sessionProofSecret: env.sessionProofSecret },
      async (tx) => tx.execute(sql`SELECT user_id, name FROM chats`),
    );
    expect(aRows).toHaveLength(1);
    expect((aRows[0] as { name: string }).name).toBe("A-chat");

    const bRows = await forUser(
      env.databaseUrl,
      { userId: userB, sessionProofSecret: env.sessionProofSecret },
      async (tx) => tx.execute(sql`SELECT user_id, name FROM chats`),
    );
    expect(bRows).toHaveLength(1);
    expect((bRows[0] as { name: string }).name).toBe("B-chat");
  });

  it("forged session_proof yields empty result, never errors", async () => {
    if (!env) return;
    const userA = await seedAuthUser(env, { email: "forged@test.invalid" });
    await insertChat(userA, "forge-target");

    // Open a raw nuansu_app connection, SET LOCAL with a forged proof,
    // attempt to read — RLS should match nothing.
    const raw = postgres(env.databaseUrl, { max: 1 });
    try {
      const rows = await raw.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL nuansu.session_proof = '${userA}:${"f".repeat(64)}'`);
        return tx`SELECT id FROM chats`;
      });
      expect(rows).toHaveLength(0);
    } finally {
      await raw.end({ timeout: 1 });
    }
  });
});

describeIntegration("RLS — cross-tenant chat_id reference attack", () => {
  it("nuansu_app cannot INSERT a message with another user's chat_id", async () => {
    if (!env) return;
    const userA = await seedAuthUser(env, { email: "owner-a@test.invalid" });
    const userB = await seedAuthUser(env, { email: "attacker-b@test.invalid" });

    // userA owns a chat.
    const aChatId = uuidv7();
    await forUser(
      env.databaseUrl,
      { userId: userA, sessionProofSecret: env.sessionProofSecret },
      async (tx) => {
        await tx.execute(sql`
          INSERT INTO chats (id, user_id, name, target_language)
          VALUES (${aChatId}, ${userA}, 'A-private', 'ja')
        `);
      },
    );

    // userB (attacker) attempts to INSERT a message with their own
    // user_id but A's chat_id. Without the chat-ownership clause in
    // messages_owner_only, this would succeed (user_id matches, FK
    // matches) and create a cross-tenant data link. With the fix,
    // RLS WITH CHECK fails.
    const empty = new Uint8Array(0);
    await expect(
      forUser(
        env.databaseUrl,
        { userId: userB, sessionProofSecret: env.sessionProofSecret },
        async (tx) => {
          await tx.execute(sql`
            INSERT INTO messages (
              id, chat_id, user_id, direction,
              final_target_text, final_target_text_nonce,
              final_source_text, final_source_text_nonce,
              prefs_snapshot, prefs_snapshot_nonce,
              model, prompt_version
            )
            VALUES (
              ${uuidv7()}, ${aChatId}, ${userB}, 'outbound',
              ${empty}, ${empty},
              ${empty}, ${empty},
              ${empty}, ${empty},
              'stub', 'v1'
            )
          `);
        },
      ),
    ).rejects.toMatchObject({
      // Drizzle wraps the Postgres error; the actual RLS violation
      // sits on `.cause`. PG code 42501 = "new row violates row-level
      // security policy". Asserting on the code (not message text)
      // also future-proofs against minor Postgres wording shifts.
      cause: expect.objectContaining({ code: "42501" }) as unknown,
    });
  });

  it("nuansu_app cannot INSERT a name_lock pinned to another user's chat_id", async () => {
    if (!env) return;
    const userA = await seedAuthUser(env, { email: "owner-a-nl@test.invalid" });
    const userB = await seedAuthUser(env, { email: "attacker-b-nl@test.invalid" });

    const aChatId = uuidv7();
    await forUser(
      env.databaseUrl,
      { userId: userA, sessionProofSecret: env.sessionProofSecret },
      async (tx) => {
        await tx.execute(sql`
          INSERT INTO chats (id, user_id, name, target_language)
          VALUES (${aChatId}, ${userA}, 'A-nl', 'ja')
        `);
      },
    );

    const empty = new Uint8Array(0);
    await expect(
      forUser(
        env.databaseUrl,
        { userId: userB, sessionProofSecret: env.sessionProofSecret },
        async (tx) => {
          await tx.execute(sql`
            INSERT INTO name_locks (id, user_id, chat_id, source_form, source_form_nonce)
            VALUES (${uuidv7()}, ${userB}, ${aChatId}, ${empty}, ${empty})
          `);
        },
      ),
    ).rejects.toMatchObject({
      // Drizzle wraps the Postgres error; the actual RLS violation
      // sits on `.cause`. PG code 42501 = "new row violates row-level
      // security policy". Asserting on the code (not message text)
      // also future-proofs against minor Postgres wording shifts.
      cause: expect.objectContaining({ code: "42501" }) as unknown,
    });
  });
});

describeIntegration("Role separation — grant-layer denial", () => {
  it("nuansu_app cannot SELECT from auth_users (no GRANT)", async () => {
    if (!env) return;
    // RLS on auth_users would scope to self if SELECT were granted —
    // but SELECT isn't granted to nuansu_app, so we expect a
    // permission-denied error before RLS even applies.
    const raw = postgres(env.databaseUrl, { max: 1 });
    try {
      await expect(raw`SELECT id FROM auth_users`).rejects.toThrow(/permission denied/);
    } finally {
      await raw.end({ timeout: 1 });
    }
  });

  it("nuansu_auth cannot SELECT from messages (no GRANT)", async () => {
    if (!env) return;
    // Defends against a leaked auth credential — the auth library
    // role can never read application content tables.
    const raw = postgres(env.authDatabaseUrl, { max: 1 });
    try {
      await expect(raw`SELECT id FROM messages`).rejects.toThrow(/permission denied/);
    } finally {
      await raw.end({ timeout: 1 });
    }
  });
});
