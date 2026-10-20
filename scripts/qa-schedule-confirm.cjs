// Local-only regression: all API calls are intercepted, no database access.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      page.setDefaultTimeout(8000);
      const user = {
        id: 99,
        rol: "admin",
        nombre: "QA",
        email: "qa@example.com",
        numero_documento: "12345678",
      };
      const categoria = { id: 1, nombre: "Cuarta", deporte: "tenis" };
      const torneo = {
        id: 1,
        nombre: "Torneo QA",
        deporte: "tenis",
        modalidad: "dobles",
        sistema: "grupos_eliminacion",
        estado: "en_curso",
      };
      const teams = [1, 2].map((id) => ({
        id,
        nombre: `Pareja ${id}`,
        deporte: "tenis",
        categoria,
        jugador1: { nombre: id === 1 ? "Andrés" : "María", apellido: "Gómez" },
      }));
      let writes = 0,
        fail = false;
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(
        (user) =>
          localStorage.setItem(
            "auth-storage-v2",
            JSON.stringify({
              state: { isAuthenticated: true, user },
              version: 0,
            }),
          ),
        user,
      );
      await page.route("**/*", (route) => {
        const req = route.request(),
          url = new URL(req.url()),
          ep = url.pathname.replace(/^\/api/, "");
        if (!url.pathname.startsWith("/api/"))
          return url.hostname === "127.0.0.1"
            ? route.continue()
            : route.abort();
        let data = [];
        if (ep.endsWith("/me")) data = user;
        if (ep === "/torneos") data = [torneo];
        if (ep === "/categorias") data = [categoria];
        if (ep === "/equipos") data = teams;
        if (ep === "/jugadores") data = [11,12].map(id => ({ id, nombre: `Jugador ${id}`, apellido: 'Prueba', deporte: 'tenis' }));
        if (ep.endsWith("/retiros")) data = { jugadores: [], parejas: [5] };
        if (ep.endsWith("/inscripciones"))
          data = {
            categorias: [
              {
                parejas: [
                  ...teams.map((t) => ({
                    ...t,
                    equipo_id: t.id,
                    inscripcion_id: t.id,
                    categoria_id: 1,
                    categoria_nombre: "Cuarta",
                  })),
                  {
                    equipo_id: 3,
                    inscripcion_id: 3,
                    nombre: "Pareja pendiente",
                    categoria_id: 1,
                    categoria_nombre: "Cuarta",
                  },
                  {
                    equipo_id: 5,
                    inscripcion_id: 5,
                    nombre: "Pareja retirada",
                    categoria_id: 1,
                    categoria_nombre: "Cuarta",
                  },
                ],
              },
            ],
          };
        if (ep.endsWith("/grupos"))
          data = {
            grupos: [
              { nombre: "GRUPO 1", categoria_id: 1, equipo_ids: [1, 2] },
            ],
            parejas: teams.map((t) => ({
              equipo_id: t.id,
              categoria_id: 1,
              grupo: "GRUPO 1",
            })),
          };
        if (ep === "/partidos/gestion/programacion")
          data = {
            conflicts: [],
            warnings: [{ message: "Descanso corto entre partidos" }],
          };
        if (ep === "/partidos" && req.method() === "POST") {
          const body = req.postDataJSON();
          if (body.modalidad === 'individual') {
            assert.equal(body.torneo_id, null);
            assert.equal(Number(body.jugador1_id), 11);
            assert.equal(Number(body.jugador2_id), 12);
          } else {
          assert.equal(Number(body.torneo_id), 1);
          assert.equal(body.grupo, "GRUPO 1");
          assert.equal(Number(body.equipo1_id), 1);
          assert.equal(Number(body.equipo2_id), 2);
          }
          if (fail)
            return route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ message: "Error simulado al guardar" }),
            });
          writes++;
          data = { id: 100 };
        }
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data }),
        });
      });
      await page.goto("http://127.0.0.1:4173/admin/partidos", { timeout: 30000 });
      await page
        .getByRole("button", { name: "Nuevo partido", exact: true })
        .click();
      const form = page.getByRole("dialog", {
        name: "Nuevo partido",
        exact: true,
      });
      await form.locator('[name="torneo_id"]').selectOption("1");
      await form.getByRole('button', { name: 'Continuar a programación', exact: true }).click();
      await form.getByRole('alert').filter({ hasText: 'Completa la categoría' }).waitFor();
      assert.equal(writes, 0);
      await form.locator('[name="categoria_id"]').selectOption("1");
      await form
        .locator('select[name="grupo"]:not([disabled])')
        .selectOption("GRUPO 1");
      await form.locator('[name="equipo1_id"]').selectOption("1");
      await form.locator('[name="equipo2_id"]').selectOption("2");
      await form.getByRole('button', { name: 'Continuar a programación', exact: true }).click();
      await form.getByRole('button', { name: 'Revisar partido', exact: true }).click();
      const save = form.getByRole("button", {
        name: "Crear partido",
        exact: true,
      });
      const dialog = page.getByRole("dialog", {
        name: "Revisa duración y descanso",
        exact: true,
      });
      await save.click();
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      assert.equal(writes, 0);
      assert.equal(await form.locator('[name="equipo1_id"]').inputValue(), "1");
      await save.click();
      await dialog.waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.equal(await form.isVisible(), true);
      fail = true;
      await save.click();
      await dialog
        .getByRole("button", { name: "Guardar programación", exact: true })
        .click();
      await form
        .getByRole("alert")
        .filter({ hasText: "Error simulado al guardar" })
        .waitFor();
      fail = false;
      await save.click();
      await dialog
        .getByRole("button", { name: "Guardar programación", exact: true })
        .click();
      await form.waitFor({ state: "detached" });
      assert.equal(writes, 1);
      await page
        .getByRole("button", { name: "Nuevo partido", exact: true })
        .click();
      await form.locator('[name="torneo_id"]').selectOption("1");
      await form.getByLabel("Encuentra la primera pareja").fill("pendiente");
      await form.getByLabel("Ver no disponibles").check();
      await form.getByRole("button", { name: /Pareja pendiente/ }).waitFor();
      assert.equal(
        await form
          .getByRole("button", { name: /Pareja pendiente/ })
          .isDisabled(),
        true,
      );
      await form.getByLabel("Encuentra la primera pareja").fill("retirada");
      await form
        .getByText("Sin coincidencias", { exact: true })
        .waitFor();
      await form.getByLabel("Encuentra la primera pareja").fill("andres gomez");
      await form
        .getByRole("button", { name: /Pareja 1.*Andrés Gómez.*GRUPO 1/ })
        .click();
      assert.equal(
        await form.locator('[name="categoria_id"]').inputValue(),
        "1",
      );
      assert.equal(
        await form.locator('[name="grupo"]').inputValue(),
        "GRUPO 1",
      );
      assert.equal(await form.locator('[name="equipo1_id"]').inputValue(), "1");
      assert.equal(
        await form.locator('[name="equipo2_id"] option[value="1"]').count(),
        0,
      );
      await form.getByLabel("Busca un rival compatible").fill("maria");
      await form.getByRole("button", { name: /Pareja 2.*María Gómez.*GRUPO 1/ }).click();
      await form.getByText("Encuentro seleccionado", { exact: true }).waitFor();
      await form.locator('.match-planner').scrollIntoViewIfNeeded();
      await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), `tenis-planner-${width}.png`) });
      await form.getByRole("button", { name: "Programar", exact: true }).click();
      assert.equal(await form.locator('[name="fecha_inicio"]').isVisible(), true);
      await form.locator('[name="fecha_inicio"]').fill("2026-12-01");
      await form.locator('[name="hora_inicio"]').fill("10:00");
      await form.getByRole('button', { name: 'Volver', exact: true }).click();
      assert.equal(await form.locator('[name="equipo1_id"]').inputValue(), '1');
      await form.getByRole('button', { name: 'Continuar a programación', exact: true }).click();
      assert.equal(await form.locator('[name="hora_inicio"]').inputValue(), '10:00');
      await form.getByRole('button', { name: 'Revisar partido', exact: true }).click();
      await form.getByRole('region', { name: 'Revisión del partido' }).waitFor();
      await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), `tenis-wizard-review-${width}.png`) });
      await form
        .getByRole("button", { name: "Guardar y crear otro", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Guardar programación", exact: true })
        .click();
      await page.waitForFunction(
        () => document.querySelector('[name="equipo1_id"]')?.value === "",
      );
      assert.equal(writes, 2);
      assert.equal(
        await form.locator('[name="grupo"]').inputValue(),
        "GRUPO 1",
      );
      assert.equal(
        await form.locator('[name="fecha_inicio"]').inputValue(),
        "",
      );
      assert.equal(await form.locator('[name="hora_inicio"]').inputValue(), "");
      assert.equal(await form.locator('[name="equipo2_id"]').inputValue(), "");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await page.getByRole('button', { name: 'Nuevo partido', exact: true }).click();
      await form.locator('[name="torneo_id"]').selectOption('');
      await form.locator('[name="categoria_id"]').selectOption('1');
      await form.locator('[name="jugador1_id"]').selectOption('11');
      await form.locator('[name="jugador2_id"]').selectOption('12');
      await form.getByRole('button', { name: 'Continuar a programación', exact: true }).click();
      await form.getByRole('button', { name: 'Revisar partido', exact: true }).click();
      await form.getByRole('button', { name: 'Crear partido', exact: true }).click();
      await dialog.getByRole('button', { name: 'Guardar programación', exact: true }).click();
      await form.waitFor({ state: 'detached' });
      assert.equal(writes, 3);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${width}px: creation, confirmation, retry, name search, automatic group, opponent exclusion and create another`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
