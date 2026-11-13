import { test, expect, Browser } from "@playwright/test";

// Two separate browser contexts = two separate phones (own localStorage, own tokens).
async function phone(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  return { ctx, page: await ctx.newPage() };
}

test("full two-phone flow: create, join, vote, file, reveal, appeal", async ({ browser }) => {
  const A = await phone(browser), B = await phone(browser);

  // A creates
  await A.page.goto("/");
  await A.page.getByPlaceholder("Your name").fill("Roki");
  await A.page.getByRole("button", { name: "Open a case" }).click();
  const code = (await A.page.locator(".codebox.big").textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{4}$/);
  await expect(A.page.getByText("Waiting for your partner...")).toBeVisible();
  await expect(A.page.locator("img.qr")).toBeVisible();

  // B joins with the share link
  await B.page.goto(`/#${code}`);
  await B.page.getByPlaceholder("Your name").fill("Dewi");
  await B.page.getByRole("button", { name: "Join", exact: true }).click();

  // both vote for different judges -> coin flip -> a judge is assigned
  await expect(A.page.getByText("Who hears this case?")).toBeVisible();
  await A.page.getByRole("button", { name: /Judge Savage/ }).click();
  await A.page.getByRole("button", { name: /Lock in my vote|Kunci pilihanku/ }).click();
  await B.page.getByRole("button", { name: /Judge Zen/ }).click();
  await B.page.getByRole("button", { name: /Lock in my vote|Kunci pilihanku/ }).click();
  await expect(A.page.getByText("File your statement")).toBeVisible({ timeout: 8000 });
  await expect(B.page.getByText("File your statement")).toBeVisible({ timeout: 8000 });

  // A files; B must NOT see A's text anywhere in the DOM
  await A.page.locator("textarea").fill("PRIVATE-A the dishes are still dirty");
  await A.page.getByRole("button", { name: "File statement" }).click();
  await expect(B.page.getByText("Your partner has filed")).toBeVisible({ timeout: 8000 });
  expect(await B.page.content()).not.toContain("PRIVATE-A");

  // B files -> judging -> synced reveal on both phones
  await B.page.locator("textarea").fill("PRIVATE-B I was busy");
  await B.page.getByRole("button", { name: "File statement" }).click();
  await expect(A.page.getByText("The ruling")).toBeVisible({ timeout: 15000 });
  await expect(B.page.getByText("The ruling")).toBeVisible({ timeout: 15000 });
  // statements are deleted once the verdict exists: the API returns none for either player
  const raw = await B.page.evaluate(async (c) => {
    const tok = Object.entries(localStorage).find(([k]) => k.includes(c))?.[1] as string;
    const r = await fetch(`/api/cases/${c}`, { headers: { "x-player-token": tok } });
    return r.text();
  }, code);
  expect(raw).toContain('"verdict"');
  const rounds = JSON.parse(raw).rounds;
  expect(rounds[0].statements.me).toBeNull();
  expect(rounds[0].statements.other).toBeNull();

  await A.page.waitForTimeout(4500);
  await A.page.screenshot({ path: "e2e/shots/verdict-A.png", fullPage: true });

  // appeal: needs both again
  await A.page.getByRole("button", { name: /Appeal/ }).click();
  await expect(A.page.getByText("Appeal 1 of 3")).toBeVisible();
  await A.ctx.close(); await B.ctx.close();
});

test("bahasa flow shows Indonesian UI and verdict", async ({ browser }) => {
  const A = await phone(browser), B = await phone(browser);
  await A.page.goto("/");
  await A.page.getByRole("button", { name: "Bahasa" }).click();
  await A.page.getByPlaceholder("Namamu").fill("Roki");
  await A.page.getByRole("button", { name: "Buka perkara" }).click();
  const code = (await A.page.locator(".codebox.big").textContent())!.trim();
  await B.page.goto(`/#${code}`);
  await B.page.getByRole("button", { name: /Join|Gabung/ }).first().click();
  await expect(A.page.getByText("Siapa yang mengadili perkara ini?")).toBeVisible();
  await A.page.getByRole("button", { name: /Judge Grandma/ }).click();
  await A.page.getByRole("button", { name: /Lock in my vote|Kunci pilihanku/ }).click();
  await B.page.getByRole("button", { name: /Judge Grandma/ }).click();
  await B.page.getByRole("button", { name: /Lock in my vote|Kunci pilihanku/ }).click();
  await expect(A.page.getByText("Ajukan pernyataanmu")).toBeVisible({ timeout: 8000 });
  await A.page.locator("textarea").fill("Dia lupa cuci piring lagi");
  await A.page.getByRole("button", { name: "Ajukan pernyataan", exact: true }).click();
  await B.page.locator("textarea").fill("Aku sibuk kerja");
  await B.page.getByRole("button", { name: "Ajukan pernyataan", exact: true }).click();
  await expect(A.page.getByText("Putusan", { exact: true })).toBeVisible({ timeout: 15000 });
  await A.page.waitForTimeout(4500); // let the staggered reveal animation finish
  await A.page.screenshot({ path: "e2e/shots/verdict-id.png", fullPage: true });
});

test("safety: scary statement shows plain support screen and no verdict", async ({ browser }) => {
  const A = await phone(browser), B = await phone(browser);
  await A.page.goto("/");
  await A.page.getByPlaceholder("Your name").fill("Roki");
  await A.page.getByRole("button", { name: "Open a case" }).click();
  const code = (await A.page.locator(".codebox.big").textContent())!.trim();
  await B.page.goto(`/#${code}`);
  await B.page.getByRole("button", { name: "Join", exact: true }).click();
  await A.page.getByRole("button", { name: /Judge Zen/ }).click();
  await A.page.getByRole("button", { name: /Lock in my vote|Kunci pilihanku/ }).click();
  await B.page.getByRole("button", { name: /Judge Zen/ }).click();
  await B.page.getByRole("button", { name: /Lock in my vote|Kunci pilihanku/ }).click();
  await expect(A.page.getByText("File your statement")).toBeVisible({ timeout: 8000 });
  await A.page.locator("textarea").fill("I'm scared of how they react when I disagree");
  await A.page.getByRole("button", { name: "File statement" }).click();
  await B.page.locator("textarea").fill("whatever");
  await B.page.getByRole("button", { name: "File statement" }).click();
  await expect(A.page.getByText("Let's pause the game")).toBeVisible({ timeout: 10000 });
  await expect(B.page.getByText("Let's pause the game")).toBeVisible({ timeout: 10000 });
  await expect(A.page.getByText("Fault split")).toHaveCount(0);
  await expect(A.page.getByText("The ruling")).toHaveCount(0);
  await A.page.screenshot({ path: "e2e/shots/safety.png", fullPage: true });
});
