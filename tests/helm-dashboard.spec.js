const { test, expect } = require("@playwright/test");

const APP_URL = "/index.html";

async function mockNoaaSuccess(page) {
  await page.route("https://api.weather.gov/**", async (route) => {
    const url = route.request().url();

    if (url.includes("/alerts/active")) {
      await route.fulfill({
        status: 200,
        contentType: "application/geo+json",
        body: JSON.stringify({ type: "FeatureCollection", features: [] })
      });
      return;
    }

    if (url.includes("/points/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/geo+json",
        body: JSON.stringify({
          properties: {
            forecastHourly: "https://api.weather.gov/gridpoints/test/hourly",
            forecast: "https://api.weather.gov/gridpoints/test/forecast"
          }
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/geo+json",
      body: JSON.stringify({
        properties: {
          updated: new Date("2026-04-29T12:00:00Z").toISOString(),
          periods: [
            {
              name: "Today",
              startTime: new Date("2026-04-29T12:00:00Z").toISOString(),
              temperature: 62,
              temperatureUnit: "F",
              windSpeed: "8 mph",
              windDirection: "NW",
              shortForecast: "Clear",
              visibility: { value: 10, unitCode: "wmoUnit:mile" }
            }
          ]
        }
      })
    });
  });
}

async function mockNoaaFailure(page) {
  await page.route("https://api.weather.gov/**", async (route) => {
    await route.abort("failed");
  });
}

async function mockNoaaHttpFailure(page) {
  await page.route("https://api.weather.gov/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/geo+json",
      body: "not-json"
    });
  });
}

async function openApp(page, options = {}) {
  const messages = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      messages.push(message.text());
    }
  });

  page.on("pageerror", (error) => {
    messages.push(error.message);
  });

  if (options.noaaFailure) {
    await mockNoaaFailure(page);
  } else {
    await mockNoaaSuccess(page);
  }

  await page.goto(APP_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState("domcontentloaded");

  return messages;
}

async function setQuickCheck(page, values) {
  const fields = {
    wind: "#quickWind",
    gusts: "#quickGusts",
    waves: "#quickWaves",
    wavePeriod: "#quickWavePeriod",
    visibility: "#quickVisibility",
    waterTemp: "#quickWaterTemp"
  };

  for (const [key, selector] of Object.entries(fields)) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      await page.locator(selector).fill(String(values[key]));
    }
  }

  if (values.trend) {
    await page.locator("#conditionsTrend").selectOption(values.trend);
  }

  if (values.leg) {
    await page.locator("#currentLeg").selectOption(values.leg);
  }

  await page.locator("#updateGuidance").click();
}

async function expectSuggestion(page, suggestion, color) {
  await expect(page.locator("#suggestedDecisionLabel")).toContainText(suggestion);
  await expect(page.locator("#suggestedDecision")).toHaveAttribute("data-suggestion", color);
}

test("boots without console errors and defaults to pending", async ({ page }) => {
  const consoleErrors = await openApp(page);

  await expect(page.locator("#decisionLabel")).toContainText(/PENDING/i);
  await expect(page.locator("#decisionPanel")).toHaveAttribute("data-decision", "none");
  await expect(page.locator("#suggestedDecision")).not.toHaveAttribute("data-suggestion", "green");
  expect(consoleErrors).toEqual([]);
});

test("Quick Check drives GO, CAUTION, and NO-GO suggestions", async ({ page }) => {
  await openApp(page);

  await setQuickCheck(page, { wind: 8, gusts: 9, waves: 1, wavePeriod: 6, visibility: 6, waterTemp: 62 });
  await expectSuggestion(page, "GO", "green");

  await setQuickCheck(page, { wind: 15, gusts: 16, waves: 2, wavePeriod: 6, visibility: 4, waterTemp: 62 });
  await expectSuggestion(page, "CAUTION", "yellow");

  await setQuickCheck(page, { wind: 24, gusts: 28, waves: 4, wavePeriod: 6, visibility: 1, waterTemp: 62 });
  await expectSuggestion(page, "NO-GO", "red");
});

test("manual GO, CAUTION, and NO-GO controls remain captain-controlled", async ({ page }) => {
  await openApp(page);

  await page.locator('[data-decision-choice="green"]').click();
  await expect(page.locator("#decisionPanel")).toHaveAttribute("data-decision", "green");
  await expect(page.locator("#decisionLabel")).toHaveText("GO");

  await page.locator('[data-decision-choice="yellow"]').click();
  await expect(page.locator("#decisionPanel")).toHaveAttribute("data-decision", "yellow");
  await expect(page.locator("#decisionLabel")).toHaveText("CAUTION");

  await page.locator('[data-decision-choice="red"]').click();
  await expect(page.locator("#decisionPanel")).toHaveAttribute("data-decision", "red");
  await expect(page.locator("#decisionLabel")).toHaveText("NO-GO");
});

test("manual GO while suggested NO-GO shows conflict warning", async ({ page }) => {
  await openApp(page);
  await setQuickCheck(page, { wind: 25, gusts: 30, waves: 4, wavePeriod: 3, visibility: 1, waterTemp: 62 });

  await page.locator('[data-decision-choice="green"]').click();

  await expectSuggestion(page, "NO-GO", "red");
  await expect(page.locator("#manualConflictWarning")).toBeVisible();
  await expect(page.locator("#manualConflictWarning")).toContainText("Manual decision is more optimistic");
});

test("Start Fresh clears operational fields but preserves static route info", async ({ page }) => {
  await openApp(page);
  await setQuickCheck(page, {
    wind: 9,
    gusts: 11,
    waves: 1,
    wavePeriod: 6,
    visibility: 6,
    waterTemp: 61,
    leg: "Petoskey to Mackinac Island"
  });
  await page.locator("#decisionReason").fill("Operational note");

  await page.locator("#startFresh").click();

  await expect(page.locator("#quickWind")).toHaveValue("");
  await expect(page.locator("#quickWaves")).toHaveValue("");
  await expect(page.locator("#quickVisibility")).toHaveValue("");
  await expect(page.locator("#decisionReason")).toHaveValue("");
  await expect(page.locator("#currentLeg")).toHaveValue("");
  await expect(page.locator("#decisionLabel")).toContainText(/PENDING/i);
  await expect(page.getByLabel("Trip summary").getByText("5 legs")).toBeVisible();
  await expect(page.getByLabel("Trip summary").getByText("229 nm")).toBeVisible();
});

test("Save Snapshot creates a persisted snapshot with current values", async ({ page }) => {
  await openApp(page);
  await setQuickCheck(page, {
    wind: 7,
    gusts: 10,
    waves: 1,
    wavePeriod: 7,
    visibility: 8,
    waterTemp: 65,
    leg: "Harrisville to East Tawas"
  });

  await page.locator("#saveSnapshot").click();

  const snapshot = page.locator("#snapshotsList .snapshot-card").first();
  await expect(snapshot).toContainText("Harrisville to East Tawas");
  await expect(snapshot).toContainText("Wind 7 mph");
  await expect(snapshot).toContainText("Gusts 10 mph");
  await expect(snapshot).toContainText("Waves 1 ft @ 7 sec");

  await page.reload();
  await expect(page.locator("#snapshotsList .snapshot-card").first()).toContainText("Harrisville to East Tawas");
});

test("localStorage persists operational state after reload", async ({ page }) => {
  await openApp(page);
  await setQuickCheck(page, {
    wind: 12,
    gusts: 14,
    waves: 2,
    wavePeriod: 5,
    visibility: 4,
    waterTemp: 59,
    trend: "Worsening",
    leg: "East Tawas to Bay City"
  });

  await page.reload();

  await expect(page.locator("#quickWind")).toHaveValue("12");
  await expect(page.locator("#quickGusts")).toHaveValue("14");
  await expect(page.locator("#quickWaves")).toHaveValue("2");
  await expect(page.locator("#quickWavePeriod")).toHaveValue("5");
  await expect(page.locator("#quickVisibility")).toHaveValue("4");
  await expect(page.locator("#quickWaterTemp")).toHaveValue("59");
  await expect(page.locator("#conditionsTrend")).toHaveValue("Worsening");
  await expect(page.locator("#currentLeg")).toHaveValue("East Tawas to Bay City");
});

test("NOAA failure is fail-closed and visible", async ({ page }) => {
  await openApp(page, { noaaFailure: true });

  await expect(page.locator("#alertsText")).toContainText("Alerts unavailable");
  await expect(page.locator("#suggestedDecision")).not.toHaveAttribute("data-suggestion", "green");

  await page.locator("#refreshNoaaWeather").evaluate((button) => button.click());
  await expect(page.locator("#noaaStatus")).toContainText("NOAA weather could not be loaded");
  await expect(page.locator("#suggestedDecisionLabel")).not.toContainText("Suggested: GO");
});

test("hostile inputs do not break the app", async ({ page }) => {
  const consoleErrors = await openApp(page);
  const hostileText = "<script>alert(1)</script> 🚩 ' OR 1=1 -- ".repeat(25);

  await page.locator("#decisionLocation").fill(hostileText);
  await page.locator("#decisionReason").fill(hostileText);
  await page.locator("#marineNotes").evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, hostileText);
  await setQuickCheck(page, {
    wind: -10,
    gusts: 9999,
    waves: 999,
    wavePeriod: -1,
    visibility: -5,
    waterTemp: -20
  });

  await expect(page.locator("#suggestedDecision")).toHaveAttribute("data-suggestion", "red");
  await expect(page.locator("#decisionLabel")).toContainText(/PENDING|GO|CAUTION|NO-GO/i);
  expect(consoleErrors).toEqual([]);
});

test("mobile viewport keeps bottom nav visible and Quick Check usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);

  await expect(page.locator(".bottom-nav")).toBeVisible();
  await expect(page.locator("#quickWind")).toBeVisible();
  await setQuickCheck(page, { wind: 8, gusts: 8, waves: 1, wavePeriod: 6, visibility: 6, waterTemp: 62 });
  await expectSuggestion(page, "GO", "green");
});

test("stress under active use with hostile inputs and NOAA failures", async ({ page }) => {
  test.setTimeout(60000);
  const consoleErrors = await openApp(page);
  await page.unroute("https://api.weather.gov/**");
  await mockNoaaHttpFailure(page);
  const hostileInputs = [
    "duplicate duplicate duplicate",
    "oversized ".repeat(700),
    "unicode Î© âš“ ðŸš© æ¼¢å­—",
    "<script>alert('helm')</script><img src=x onerror=alert(1)>",
    "'; DROP TABLE routes; -- OR 1=1"
  ];
  const manualChoices = ["green", "yellow", "red"];

  await Promise.all([
    page.locator("#refreshNoaaWeather").evaluate((button) => button.click()),
    page.locator("#refreshNoaaAlerts").click(),
    (async () => {
      for (let index = 0; index < 9; index += 1) {
        await setQuickCheck(page, {
          wind: index % 3 === 0 ? 8 : index % 3 === 1 ? 16 : 28,
          gusts: index % 3 === 0 ? 9 : index % 3 === 1 ? 20 : 34,
          waves: index % 3 === 0 ? 1 : index % 3 === 1 ? 2 : 5,
          wavePeriod: index % 2 === 0 ? 3 : 7,
          visibility: index % 3 === 2 ? 1 : 6,
          waterTemp: index % 2 === 0 ? 48 : 63,
          trend: index % 2 === 0 ? "Worsening" : "Stable"
        });
        await page.locator(`[data-decision-choice="${manualChoices[index % manualChoices.length]}"]`).click();
        await page.locator("#decisionReason").fill(hostileInputs[index % hostileInputs.length]);
        await page.locator("#weatherNotes").evaluate(
          (element, value) => {
            element.value = value;
            element.dispatchEvent(new Event("input", { bubbles: true }));
          },
          hostileInputs[(index + 1) % hostileInputs.length]
        );
        await page.locator("#marineNotes").evaluate(
          (element, value) => {
            element.value = value;
            element.dispatchEvent(new Event("input", { bubbles: true }));
          },
          hostileInputs[(index + 2) % hostileInputs.length]
        );

        if (index < 6) {
          await page.locator("#saveSnapshot").click();
        }
      }
    })()
  ]);

  await expect(page.locator("#noaaStatus")).toContainText("NOAA weather could not be loaded");
  await expect(page.locator("#alertsText")).toContainText("Alerts unavailable");
  await expect(page.locator("#suggestedDecisionLabel")).toBeVisible();
  await expect(page.locator("#decisionPanel")).toHaveAttribute("data-decision", /green|yellow|red|none/);
  await page.locator('[data-decision-choice="yellow"]').click();
  await expect(page.locator("#decisionPanel")).toHaveAttribute("data-decision", "yellow");

  await expect(page.locator("#snapshotsList .snapshot-card")).toHaveCount(6);
  const storedState = await page.evaluate(() => {
    JSON.parse(localStorage.getItem("helm-decision") || "{}");
    JSON.parse(localStorage.getItem("helm-snapshots") || "[]");
    return {
      decision: localStorage.getItem("helm-decision"),
      snapshots: JSON.parse(localStorage.getItem("helm-snapshots") || "[]").length
    };
  });
  expect(storedState.decision).toBeTruthy();
  expect(storedState.snapshots).toBe(6);

  await page.locator("#startFresh").click();
  await expect(page.locator("#quickWind")).toHaveValue("");
  await expect(page.locator("#quickWaves")).toHaveValue("");
  await expect(page.locator("#quickVisibility")).toHaveValue("");
  await expect(page.locator("#decisionLabel")).toContainText(/PENDING/i);
  await expect(page.locator("#suggestedDecisionLabel")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
