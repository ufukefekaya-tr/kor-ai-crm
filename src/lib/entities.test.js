// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { formBody, initialValues, localInput } from "./entities.js";

test("full replacement body drops cleared optional fields and derived metadata", () => {
  const initial = initialValues("customers", {
    id: "private-record-id",
    name: "Synthetic account",
    status: "active",
    email: "example@example.invalid",
    notes: "Old notes",
    assignedRepId: "rep-id",
    lat: 25,
    lng: 25,
    analysis: { score: 99 },
  });
  const body = formBody("customers", {
    ...initial,
    email: "",
    notes: "",
    assignedRepId: "",
    lat: "",
    lng: "",
  });
  assert.equal(body.name, "Synthetic account");
  for (const key of [
    "id",
    "analysis",
    "email",
    "notes",
    "assignedRepId",
    "lat",
    "lng",
  ])
    assert.equal(Object.hasOwn(body, key), false, key);
});
test("zero coordinates and zero amounts remain explicit values", () => {
  const body = formBody("visits", {
    customerId: "customer",
    repId: "rep",
    occurredAt: "2026-10-18T10:00",
    outcome: "discovery",
    notes: "A concrete synthetic visit",
    lat: "0",
    lng: "0",
    amount: "0",
    durationMinutes: "0",
  });
  for (const key of ["lat", "lng", "amount", "durationMinutes"])
    assert.equal(body[key], 0);
});
test("datetime-local round trip preserves an ISO instant in the selected timezone", () => {
  const previous = process.env.TZ;
  process.env.TZ = "Europe/Istanbul";
  try {
    const iso = "2026-10-18T06:30:00.000Z";
    const local = localInput(iso);
    assert.equal(local, "2026-10-18T09:30");
    const body = formBody("appointments", {
      title: "Synthetic follow-up",
      customerId: "customer",
      repId: "rep",
      startsAt: local,
      endsAt: "2026-10-18T10:30",
      status: "planned",
    });
    assert.equal(body.startsAt, iso);
    assert.equal(body.endsAt, "2026-10-18T07:30:00.000Z");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test("route stop order is kept exactly while metadata is omitted", () => {
  const body = formBody("routes", {
    id: "derived",
    name: "Synthetic route",
    repId: "rep",
    visitDate: "2026-10-18",
    stopCustomerIds: ["third", "first", "second"],
    distanceKm: 20,
  });
  assert.deepEqual(body.stopCustomerIds, ["third", "first", "second"]);
  assert.equal(Object.hasOwn(body, "distanceKm"), false);
});

test("new record forms accept an explicit null record and keep defaults", () => {
  assert.deepEqual(initialValues("reps", null), { active: true });
  assert.equal(initialValues("customers", null).status, "prospect");
});
