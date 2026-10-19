import { test } from "node:test";
import assert from "node:assert/strict";
import {
  searchPair,
  incompatibility,
  previousMeetings,
} from "../scores-app/src/utils/matchPlanner.mjs";
const first = {
  equipo_id: 1,
  categoria_id: 2,
  grupo: "A",
  nombre: "GÓMEZ / LÓPEZ",
  jugador1: { id: 1, nombre: "Andrés", apellido: "Gómez" },
  jugador2: { id: 2 },
};
const second = {
  equipo_id: 2,
  categoria_id: 2,
  grupo: "A",
  jugador1: { id: 3 },
  jugador2: { id: 4 },
};
test("search full names, mixed case, accents and token order", () => {
  assert.ok(searchPair(first, "gomez andres"));
  assert.ok(searchPair(first, "LOPEZ"));
  assert.equal(searchPair(first, "maria"), false);
});
test("group phase rejects absent group, same pair, other category, other group and overlapping players", () => {
  assert.equal(incompatibility(second, first, true), "");
  for (const candidate of [
    first,
    { ...second, grupo: "" },
    { ...second, grupo: "B" },
    { ...second, categoria_id: 3 },
    { ...second, jugador2: { id: 1 } },
  ])
    assert.ok(incompatibility(candidate, first, true));
});
test("elimination permits different groups, never different categories or shared players", () => {
  assert.equal(incompatibility({ ...second, grupo: "B" }, first, false), "");
  assert.equal(incompatibility({ ...second, grupo: "" }, first, false), "");
  assert.ok(incompatibility({ ...second, categoria_id: 3 }, first, false));
  assert.ok(incompatibility({ ...second, jugador1: { id: 2 } }, first, false));
});
test("history finds both orders but excludes cancelled and other tournaments", () => {
  const match = {
    torneo: { id: 8 },
    equipo1: { id: 2 },
    equipo2: { id: 1 },
    estado: "programado",
  };
  assert.equal(
    previousMeetings(
      [
        match,
        { ...match, estado: "cancelado" },
        { ...match, torneo: { id: 9 } },
      ],
      8,
      first,
      second,
    ).length,
    1,
  );
  assert.deepEqual(previousMeetings([match], 8, first, null), []);
});
