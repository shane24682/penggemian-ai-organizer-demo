import assert from "node:assert/strict";
import test from "node:test";

import type { PublishedRequest } from "../lib/p0-api";
import {
  canCancelRequest,
  canRunRequestMatching,
  chooseRequestId,
  requestStatusLabel,
} from "../lib/p0-requests";

const request = (id: string, status: PublishedRequest["status"] = "OPEN"): PublishedRequest => ({
  id,
  sceneCode: "MATH_MODELING",
  competitionName: "全国大学生数学建模竞赛",
  title: `需求 ${id}`,
  description: null,
  startsAt: "2026-09-20T11:00:00.000Z",
  endsAt: "2026-09-20T13:00:00.000Z",
  weeklyHoursRequired: 8,
  participantLimit: 3,
  applicationDeadline: "2026-09-19T11:00:00.000Z",
  status,
  createdAt: "2026-09-17T08:00:00.000Z",
});

test("keeps a valid selected request and otherwise selects the latest row", () => {
  const rows = [request("new"), request("old")];
  assert.equal(chooseRequestId(rows, "old"), "old");
  assert.equal(chooseRequestId(rows, "missing"), "new");
  assert.equal(chooseRequestId([], "missing"), "");
});

test("allows matching and cancellation only for active request states", () => {
  assert.equal(canRunRequestMatching("OPEN"), true);
  assert.equal(canRunRequestMatching("MATCHING"), true);
  assert.equal(canRunRequestMatching("INVITING"), false);
  assert.equal(canRunRequestMatching("CANCELLED"), false);

  for (const status of ["DRAFT", "OPEN", "MATCHING", "INVITING"] as const) {
    assert.equal(canCancelRequest(status), true);
  }
  for (const status of ["FULFILLED", "CANCELLED", "EXPIRED"] as const) {
    assert.equal(canCancelRequest(status), false);
  }
});

test("has a user-facing label for every request state", () => {
  const statuses: PublishedRequest["status"][] = [
    "DRAFT",
    "OPEN",
    "MATCHING",
    "INVITING",
    "FULFILLED",
    "CANCELLED",
    "EXPIRED",
  ];
  for (const status of statuses) assert.ok(requestStatusLabel[status]);
});
