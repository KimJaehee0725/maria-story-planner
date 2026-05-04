import { expect, test } from "@playwright/test";

test("planner render, navigation, editing, save, and LLM drawer smoke", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /숨은 컷 작업실/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "인물 구성" })).toBeVisible();

  await page.getByRole("button", { name: "인물 구성" }).click();
  await expect(page.getByRole("heading", { name: "인물 구성과 심리 아크" })).toBeVisible();

  const search = page.getByPlaceholder("인물, 사건, 조직 검색");
  await search.fill("지유");
  await expect(page.locator(".character-row", { hasText: "차지유" })).toBeVisible();
  await expect(page.locator(".character-row", { hasText: "강무진" })).toHaveCount(0);

  await page.locator(".character-row", { hasText: "차지유" }).click();
  await page.getByLabel("역할").fill("다큐 PD / 주인공 / E2E");
  await expect(page.getByText("저장 전 변경사항")).toBeVisible();

  await search.fill("");
  await page.getByRole("button", { name: "타임라인" }).click();
  await expect(page.getByRole("heading", { name: "사건, 감정, 조직 영향이 함께 보이는 타임라인" })).toBeVisible();
  await expect(page.locator(".timeline-column-header h3", { hasText: /^과거$/ })).toBeVisible();
  await expect(page.locator(".timeline-column-header h3", { hasText: /^Act 1$/ })).toBeVisible();

  await page.getByRole("button", { name: "회차 기준" }).click();
  await expect(page.locator(".timeline-column", { hasText: "1화. 방영되지 않은 컷" })).toBeVisible();
  await expect(page.locator(".timeline-column", { hasText: "미배정" })).toBeVisible();

  await page.getByRole("button", { name: "심리선" }).click();
  await expect(page.locator(".timeline-lane-header h3", { hasText: /^차지유$/ })).toBeVisible();
  await expect(page.getByText(/직업적 흥분/).first()).toBeVisible();

  await page.getByRole("button", { name: "이야기 순서" }).click();
  await page.locator(".year-chip", { hasText: "Act 1" }).click();
  await expect(page.locator(".event-card", { hasText: "원본 편집본 발견" })).toBeVisible();
  await expect(page.locator(".event-card", { hasText: "입소 기록의 다른 이름" })).toHaveCount(0);
  await page.locator(".year-chip", { hasText: "Act 1" }).click();
  await expect(page.locator(".event-card", { hasText: "입소 기록의 다른 이름" })).toBeVisible();

  await page.locator(".event-card", { hasText: "원본 편집본 발견" }).click();
  const characterRelations = page.locator(".relation-editor", { hasText: "관련 인물" });
  await characterRelations.locator(".choice-row", { hasText: "차지유" }).locator("input").click();
  await characterRelations.locator(".choice-row", { hasText: "오민서" }).locator("input").click();
  await expect(page.getByText("저장 전 변경사항")).toBeVisible();

  await page.getByRole("button", { name: /관계 미연결만/ }).click();
  await expect(page.locator(".event-card", { hasText: "원본 편집본 발견" })).toBeVisible();
  await expect(page.locator(".event-card", { hasText: "주민 설명회 붕괴" })).toHaveCount(0);

  const saveResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/project") && response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "저장" }).click();
  await expect((await saveResponse).ok()).toBe(true);
  await expect(page.getByText(/마지막 저장:/)).toBeVisible();

  await page.getByRole("button", { name: /기획 채팅/ }).click();
  await expect(page.getByRole("dialog", { name: "LLM 기획 채팅" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "import.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("새 인물 민아를 추가한다."),
  });
  await expect(page.getByText("import.txt")).toBeVisible();
  await page.getByRole("button", { name: "가져오기" }).click();
  await expect(page.getByText(/LLM 기능이 꺼져 있습니다/)).toBeVisible();
  await expect(page.getByPlaceholder("기획 지시를 입력하세요")).toBeVisible();
});
