import { describe, expect, it } from "vitest";
import {
  accountCondition,
  allowedAccountIds,
  grantFreshness,
  GRANTS_FRESH_MS,
  GRANTS_MAX_AGE_MS,
  matchGrants,
  parsePedroAccess,
} from "../lib/access/grants";

const accounts = [
  { id: "acc_a", appScopedId: "27071421349200055" },
  { id: "acc_b", appScopedId: "28365365456423484" },
  { id: "acc_old", appScopedId: null },
];

describe("matchGrants", () => {
  it("matches channels by app-scoped id and drops unknown capabilities", () => {
    expect(
      matchGrants(
        [
          {
            channelId: "ch_1",
            instagramExternalId: "27071421349200055",
            instagramHandle: "sobrunoandrade",
            capabilities: ["inbox.read", "video.edit", "comment.read"],
          },
        ],
        accounts
      )
    ).toEqual([{ instagramAccountId: "acc_a", capabilities: ["comment.read", "inbox.read"] }]);
  });

  it("never matches by handle or by the professional account id", () => {
    expect(
      matchGrants(
        [
          { channelId: "ch_1", instagramExternalId: "17841441924220803", instagramHandle: "acc_a", capabilities: ["inbox.read"] },
          { channelId: "ch_2", instagramExternalId: null, instagramHandle: "usewatchfolio", capabilities: ["inbox.read"] },
        ],
        accounts
      )
    ).toEqual([]);
  });

  it("merges two channels on one account and skips empty grants", () => {
    expect(
      matchGrants(
        [
          { channelId: "ch_1", instagramExternalId: "27071421349200055", capabilities: ["inbox.read"] },
          { channelId: "ch_2", instagramExternalId: "27071421349200055", capabilities: ["comment.reply"] },
          { channelId: "ch_3", instagramExternalId: "28365365456423484", capabilities: ["video.edit"] },
        ],
        accounts
      )
    ).toEqual([{ instagramAccountId: "acc_a", capabilities: ["comment.reply", "inbox.read"] }]);
  });
});

describe("grantFreshness", () => {
  const now = 1_000_000_000_000;
  it("ages from fresh to stale to expired", () => {
    expect(grantFreshness(null, now)).toBe("expired");
    expect(grantFreshness(new Date(now - GRANTS_FRESH_MS + 1), now)).toBe("fresh");
    expect(grantFreshness(new Date(now - GRANTS_FRESH_MS), now)).toBe("stale");
    expect(grantFreshness(new Date(now - GRANTS_MAX_AGE_MS), now)).toBe("expired");
  });
});

describe("allowedAccountIds and accountCondition", () => {
  const grants = [
    { instagramAccountId: "acc_a", capabilities: ["comment.read" as const] },
    { instagramAccountId: "acc_b", capabilities: ["inbox.read" as const] },
  ];

  it("filters accounts by capability", () => {
    expect(allowedAccountIds(grants, "comment.read")).toEqual(["acc_a"]);
    expect(allowedAccountIds(grants, "any")).toEqual(["acc_a", "acc_b"]);
    expect(allowedAccountIds(grants, "campaign.manage")).toEqual([]);
  });

  it("keeps the old behaviour when unrestricted", () => {
    expect(accountCondition(null)).toBeUndefined();
    expect(accountCondition(null, "all")).toBeUndefined();
    expect(accountCondition(null, "acc_b")).toBe("acc_b");
  });

  it("restricts to the scope otherwise", () => {
    expect(accountCondition(["acc_a"])).toEqual({ in: ["acc_a"] });
    expect(accountCondition(["acc_a"], "acc_a")).toBe("acc_a");
    expect(accountCondition(["acc_a"], "acc_b")).toEqual({ in: [] });
    expect(accountCondition([], undefined)).toEqual({ in: [] });
  });
});

describe("parsePedroAccess", () => {
  it("accepts the contract shape and rejects anything else", () => {
    expect(
      parsePedroAccess({
        userId: "u1",
        email: "a@b.c",
        name: "A",
        image: null,
        platformAdmin: false,
        channels: [{ channelId: "c1", instagramExternalId: null, capabilities: ["inbox.read", 3] }],
      })
    ).toMatchObject({ userId: "u1", channels: [{ channelId: "c1", instagramExternalId: null, capabilities: ["inbox.read"] }] });
    expect(parsePedroAccess({ email: "a@b.c", channels: [] })).toBeNull();
    expect(parsePedroAccess({ userId: "u1", email: "a@b.c", channels: [{}] })).toBeNull();
    expect(parsePedroAccess("nope")).toBeNull();
  });
});
