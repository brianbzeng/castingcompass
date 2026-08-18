import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });
test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

const DESKTOP = { width: 1440, height: 900 };

async function stubMarketingPreviewApis(page: Page) {
  await page.route("**/api/marketing/recent-catches?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reports: [] }),
    }),
  );
  await page.route("**/api/marketing/community-preview?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ posts: [] }),
    }),
  );
}

async function openDesktop(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await stubMarketingPreviewApis(page);
  await page.goto("/");
  await expect(page.locator(".cc-landing")).toHaveClass(/cc-intro-settled/, {
    timeout: 10_000,
  });
  await expect(page.locator("[data-usp-row]")).toHaveCount(3);
  await expect(page.locator("[data-usp-figure]")).toHaveCount(3);
  await expect(page.locator(".cc-usp-section")).toHaveAttribute(
    "data-usp-lenis",
    "active",
  );
  await expect
    .poll(() =>
      page
        .locator("[data-usp-story-asset]")
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).complete),
        ),
    )
    .toBe(true);
}

async function jumpTo(page: Page, scrollY: number) {
  const target = Math.round(scrollY);
  await page.evaluate((nextScrollY) => {
    const controlledWindow = window as typeof window & {
      __castingCompassLenis?: {
        scrollTo: (
          target: number,
          options: { immediate: boolean; force: boolean },
        ) => void;
      };
    };
    document.documentElement.style.scrollBehavior = "auto";
    if (controlledWindow.__castingCompassLenis) {
      controlledWindow.__castingCompassLenis.scrollTo(nextScrollY, {
        immediate: true,
        force: true,
      });
    } else {
      window.scrollTo(0, nextScrollY);
    }
  }, target);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(
    target,
    0,
  );
  await page.waitForTimeout(60);
}

async function readRowPageGeometry(page: Page) {
  return page.locator("[data-usp-row]").evaluateAll((rows) =>
    rows.map((row) => {
      const rect = row.getBoundingClientRect();
      return {
        pageTop: rect.top + window.scrollY,
        pageBottom: rect.bottom + window.scrollY,
        height: rect.height,
      };
    }),
  );
}

test("the cream approach surface rises while the pinned hero contracts", async ({
  page,
}) => {
  await openDesktop(page);

  const readTransition = () =>
    page.evaluate(() => {
      const opening = document.querySelector<HTMLElement>(".cc-opening")!;
      const hero = document.querySelector<HTMLElement>(".cc-opening-sticky")!;
      const approach = document.querySelector<HTMLElement>(".cc-usp-section")!;
      const openingRect = opening.getBoundingClientRect();
      const heroRect = hero.getBoundingClientRect();
      const approachRect = approach.getBoundingClientRect();
      return {
        openingHeight: openingRect.height,
        heroTop: heroRect.top,
        heroHeight: heroRect.height,
        heroPosition: getComputedStyle(hero).position,
        heroTransform: getComputedStyle(hero).transform,
        heroRadius: getComputedStyle(hero).borderTopLeftRadius,
        heroSqueezeProgress: Number(hero.dataset.heroSqueezeProgress ?? "0"),
        approachTop: approachRect.top,
        approachRadius: getComputedStyle(approach).borderTopLeftRadius,
      };
    });

  const initial = await readTransition();
  expect(initial.openingHeight).toBeCloseTo(DESKTOP.height * 2, 0);
  expect(initial.heroHeight).toBeCloseTo(DESKTOP.height, 0);
  expect(initial.heroPosition).toBe("sticky");
  expect(initial.heroTop).toBeCloseTo(0, 0);
  expect(initial.heroSqueezeProgress).toBeCloseTo(0, 2);
  expect(initial.heroTransform).toBe("matrix(1, 0, 0, 1, 0, 0)");
  expect(initial.approachTop).toBeCloseTo(DESKTOP.height, 0);
  expect(Number.parseFloat(initial.approachRadius)).toBeGreaterThan(0);

  await jumpTo(page, DESKTOP.height / 2);
  const midpoint = await readTransition();
  expect(midpoint.heroSqueezeProgress).toBeCloseTo(0.5, 1);
  expect(midpoint.heroTop).toBeLessThan(0);
  expect(midpoint.heroTransform).not.toBe("matrix(1, 0, 0, 1, 0, 0)");
  expect(Number.parseFloat(midpoint.heroRadius)).toBeGreaterThan(0);
  expect(midpoint.approachTop).toBeCloseTo(DESKTOP.height / 2, 0);

  await jumpTo(page, DESKTOP.height);
  const covered = await readTransition();
  expect(covered.heroSqueezeProgress).toBeCloseTo(1, 2);
  expect(covered.heroTop).toBeLessThan(midpoint.heroTop);
  expect(covered.approachTop).toBeCloseTo(0, 0);
});

test("extension-injected root attributes do not surface a hydration error", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydrated|hydration|server rendered HTML/i.test(message.text())
    ) {
      hydrationErrors.push(message.text());
    }
  });
  await page.route("**/", async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "<body>",
      '<body data-new-gr-c-s-check-loaded="14.1320.0" data-gr-ext-installed="">',
    );
    await route.fulfill({ response, body });
  });

  await page.goto("/");
  await expect(page.locator(".cc-landing")).toBeVisible();
  await page.waitForTimeout(250);

  expect(hydrationErrors).toEqual([]);
});

test("map contours begin during the loader handoff and draw deliberately", async ({
  page,
}) => {
  await openDesktop(page);
  await expect(page.locator(".cc-topo-loader")).toHaveCount(0);
  await expect(page.locator(".cc-hero-bathymetry path").first()).toHaveCSS(
    "animation-delay",
    "0.8s",
  );
  await expect(page.locator(".cc-hero-bathymetry path").first()).toHaveCSS(
    "animation-duration",
    "2.6s",
  );
  await expect(page.locator(".cc-hero-bathymetry path").first()).toHaveCSS(
    "animation-timing-function",
    "cubic-bezier(0.37, 0, 0.63, 1)",
  );
  const contourAnimationSelectors = await page.evaluate(() =>
    Array.from(document.styleSheets).flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .filter(
            (rule) =>
              rule instanceof CSSStyleRule &&
              rule.selectorText.includes(".cc-hero-bathymetry path"),
          )
          .map((rule) => (rule as CSSStyleRule).selectorText);
      } catch {
        return [];
      }
    }),
  );
  expect(contourAnimationSelectors).toContain(
    ".cc-intro-revealing .cc-hero-bathymetry path, .cc-intro-settled .cc-hero-bathymetry path",
  );
});

test("the post-gallery image chapter moves in document flow and reveals text promptly", async ({
  page,
}) => {
  await openDesktop(page);
  const chapter = page.locator("[data-image-chapter='daylight']");
  const chapterGeometry = await chapter.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const sticky = element.querySelector<HTMLElement>(
      ".cc-image-chapter-sticky",
    )!;
    const nextSection = element.nextElementSibling as HTMLElement;
    const nextRect = nextSection.getBoundingClientRect();
    return {
      pageTop: rect.top + window.scrollY,
      pageBottom: rect.bottom + window.scrollY,
      height: rect.height,
      overflow: getComputedStyle(element).overflow,
      stickyPosition: getComputedStyle(sticky).position,
      nextPageTop: nextRect.top + window.scrollY,
      lineCount: element.querySelectorAll("[data-chapter-line]").length,
      imageCount: element.querySelectorAll("img").length,
      parsedBaseRules: Array.from(document.styleSheets).flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules)
            .filter(
              (rule) =>
                rule instanceof CSSStyleRule &&
                rule.selectorText.includes(".cc-image-chapter"),
            )
            .map((rule) => (rule as CSSStyleRule).selectorText);
        } catch {
          return [];
        }
      }),
    };
  });

  expect(chapterGeometry.height).toBeCloseTo(DESKTOP.height, 0);
  expect(chapterGeometry.overflow).toBe("clip");
  expect(chapterGeometry.stickyPosition).toBe("relative");
  expect(chapterGeometry.nextPageTop).toBeCloseTo(
    chapterGeometry.pageBottom,
    0,
  );
  expect(chapterGeometry.lineCount).toBe(5);
  expect(chapterGeometry.imageCount).toBe(1);
  expect(chapterGeometry.parsedBaseRules).toContain(
    ".cc-landing .cc-image-chapter",
  );
  expect(chapterGeometry.parsedBaseRules).toContain(
    ".cc-landing .cc-image-chapter-sticky",
  );

  await jumpTo(page, chapterGeometry.pageTop - DESKTOP.height * 0.5);
  const imageTopBeforeScroll = await chapter
    .locator(".cc-image-chapter-sticky > img")
    .evaluate((image) => image.getBoundingClientRect().top);
  await jumpTo(page, chapterGeometry.pageTop - DESKTOP.height * 0.5 + 120);
  const imageTopAfterScroll = await chapter
    .locator(".cc-image-chapter-sticky > img")
    .evaluate((image) => image.getBoundingClientRect().top);
  expect(imageTopBeforeScroll - imageTopAfterScroll).toBeCloseTo(120, 0);

  await jumpTo(page, chapterGeometry.pageTop - DESKTOP.height * 0.98);
  const early = await chapter
    .locator("[data-chapter-line='headline-2']")
    .evaluate((line) => Number(getComputedStyle(line).opacity));
  await jumpTo(page, chapterGeometry.pageTop - DESKTOP.height * 0.5);
  const staggered = await chapter.evaluate((element) => ({
    first: Number(
      getComputedStyle(
        element.querySelector<HTMLElement>(
          "[data-chapter-line='headline-1']",
        )!,
      ).opacity,
    ),
    second: Number(
      getComputedStyle(
        element.querySelector<HTMLElement>(
          "[data-chapter-line='headline-2']",
        )!,
      ).opacity,
    ),
  }));
  await jumpTo(page, chapterGeometry.pageTop - DESKTOP.height * 0.2);
  const revealed = await chapter
    .locator("[data-chapter-line='headline-2']")
    .evaluate((line) => Number(getComputedStyle(line).opacity));

  expect(early).toBeLessThan(0.1);
  expect(staggered.first).toBeGreaterThan(0.1);
  expect(staggered.first).toBeGreaterThan(staggered.second);
  expect(revealed).toBeGreaterThan(0.9);

  await jumpTo(page, chapterGeometry.pageBottom + DESKTOP.height * 0.1);
  const escapedImage = await page.evaluate(() => {
    const image = document.querySelector<HTMLElement>(
      ".cc-image-chapter-sticky > img",
    )!;
    const rect = image.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  });
  expect(escapedImage).toBe(false);
});

test("desktop owns the corrected story order, alternating grid, and one final CTA", async ({
  page,
}) => {
  await openDesktop(page);

  const contract = await page.locator(".cc-usp-section").evaluate((section) => {
    const sectionRect = section.getBoundingClientRect();
    const rows = Array.from(
      section.querySelectorAll<HTMLElement>("[data-usp-row]"),
    );
    const figures = Array.from(
      section.querySelectorAll<HTMLElement>("[data-usp-figure]"),
    );
    const rails = Array.from(
      section.querySelectorAll<HTMLElement>("[data-usp-grid-divider]"),
    );
    return {
      section: {
        width: sectionRect.width,
        height: sectionRect.height,
      },
      assets: Array.from(
        section.querySelectorAll<HTMLImageElement>("[data-usp-story-asset]"),
      ).map((image) => new URL(image.currentSrc || image.src).pathname),
      sides: figures.map((figure) => figure.dataset.uspSide),
      headlines: Array.from(
        section.querySelectorAll<HTMLElement>(".cc-usp-headline"),
      ).map((headline) => headline.textContent?.replace(/\s+/g, " ").trim()),
      rowPositions: rows.map((row) => getComputedStyle(row).position),
      figurePositions: figures.map((figure) => getComputedStyle(figure).position),
      directFigures: figures.map((figure) =>
        figure.parentElement?.matches("[data-usp-row]"),
      ),
      railsX: rails.map((rail) => rail.getBoundingClientRect().left),
      actionsPerStory: Array.from(
        section.querySelectorAll<HTMLElement>("[data-story-content]"),
      ).map((story) => story.querySelectorAll(".cc-testflight-button").length),
      disclosureCount: section.querySelectorAll("#cc-usp-mockup-disclosure")
        .length,
      legacyCount: section.querySelectorAll(
        "[data-usp-media-plane], [data-usp-foreground-layer], [data-usp-story-panel], [data-usp-window], [data-usp-occluder]",
      ).length,
      imageRatios: figures.map((figure) => {
        const wrapper = figure.getBoundingClientRect();
        const image = figure.querySelector("img")!.getBoundingClientRect();
        return {
          width: image.width / wrapper.width,
          height: image.height / wrapper.height,
          objectFit: getComputedStyle(figure.querySelector("img")!).objectFit,
        };
      }),
    };
  });

  expect(contract.section.width).toBeCloseTo(1440, 0);
  expect(contract.section.height / DESKTOP.height).toBeGreaterThanOrEqual(1.8);
  expect(contract.section.height / DESKTOP.height).toBeLessThanOrEqual(2.05);
  expect(contract.assets).toEqual([
    "/marketing/daylight-draft/adobe-rock-anglers-watermarked.jpg",
    "/marketing/daylight-draft/personal-measured-catch.jpg",
    "/marketing/daylight-draft/adobe-phone-watermarked.webp",
  ]);
  expect(contract.sides).toEqual(["left", "right", "left"]);
  expect(contract.headlines).toEqual([
    "See what moves a spot up the list.",
    "Every trip tells you something.",
    "Save what worked for next time.",
  ]);
  expect(contract.actionsPerStory).toEqual([0, 0, 1]);
  expect(contract.disclosureCount).toBe(1);
  expect(contract.legacyCount).toBe(0);
  expect(contract.rowPositions.every((position) => position === "relative")).toBe(
    true,
  );
  expect(
    contract.figurePositions.every(
      (position) => position !== "fixed" && position !== "sticky",
    ),
  ).toBe(true);
  expect(contract.directFigures).toEqual([true, true, true]);
  expect(contract.railsX).toHaveLength(2);
  expect(contract.railsX[0]).toBeCloseTo(356, 1);
  expect(contract.railsX[1]).toBeCloseTo(1084, 1);
  for (const ratio of contract.imageRatios) {
    expect(ratio.width).toBeGreaterThanOrEqual(2);
    expect(ratio.width).toBeLessThanOrEqual(2.25);
    expect(ratio.height).toBeGreaterThanOrEqual(2);
    expect(ratio.height).toBeLessThanOrEqual(2.25);
    expect(ratio.objectFit).toBe("cover");
  }
});

test("wrappers move at document speed while oversized images visibly travel more slowly", async ({
  page,
}) => {
  await openDesktop(page);
  const rows = await readRowPageGeometry(page);

  const readMedia = () =>
    page.locator("[data-usp-figure]").evaluateAll((figures) =>
      figures.map((figure) => {
        const wrapper = figure.getBoundingClientRect();
        const image = figure.querySelector<HTMLImageElement>("img")!;
        const imageRect = image.getBoundingClientRect();
        const matrix = new DOMMatrixReadOnly(getComputedStyle(image).transform);
        return {
          wrapperTop: wrapper.top,
          wrapperWidth: wrapper.width,
          wrapperHeight: wrapper.height,
          imageTop: imageRect.top,
          imageBottom: imageRect.bottom,
          imageWidth: imageRect.width,
          imageHeight: imageRect.height,
          translateY: matrix.m42,
        };
      }),
    );

  await jumpTo(page, rows[0].pageTop - 200);
  const before = await readMedia();
  await jumpTo(page, rows[0].pageTop - 100);
  const after = await readMedia();

  before.forEach((media, index) => {
    expect(after[index].wrapperTop - media.wrapperTop).toBeCloseTo(-100, 0);
    expect(after[index].wrapperWidth).toBeCloseTo(media.wrapperWidth, 2);
    expect(after[index].wrapperHeight).toBeCloseTo(media.wrapperHeight, 2);
    expect(after[index].imageWidth).toBeCloseTo(media.imageWidth, 2);
    expect(after[index].imageHeight).toBeCloseTo(media.imageHeight, 2);
  });
  expect(
    after[0].imageTop - before[0].imageTop,
  ).toBeGreaterThan(-100);
  const visibleCropTravel = after[0].translateY - before[0].translateY;
  expect(visibleCropTravel).toBeGreaterThanOrEqual(8);

  for (const [index, row] of rows.entries()) {
    await jumpTo(page, row.pageTop - DESKTOP.height + 1);
    const entry = (await readMedia())[index];
    await jumpTo(page, row.pageBottom - 1);
    const exit = (await readMedia())[index];
    const travelRatio = (exit.translateY - entry.translateY) / row.height;
    expect(travelRatio).toBeGreaterThanOrEqual(0.12);
    expect(travelRatio).toBeLessThanOrEqual(0.2);
    for (const sample of [entry, exit]) {
      expect(sample.imageTop).toBeLessThanOrEqual(sample.wrapperTop);
      expect(sample.imageBottom).toBeGreaterThanOrEqual(
        sample.wrapperTop + sample.wrapperHeight,
      );
    }
  }
});

test("shared lines align images, clipping, and the intentional 20 percent crossover", async ({
  page,
}) => {
  await openDesktop(page);
  const rows = await readRowPageGeometry(page);

  for (const incomingIndex of [1, 2]) {
    const boundaryPageY = rows[incomingIndex].pageTop;
    await jumpTo(page, boundaryPageY - DESKTOP.height / 2);
    const handoff = await page.locator(".cc-usp-section").evaluate(
      (section, index) => {
        const figures = Array.from(
          section.querySelectorAll<HTMLElement>("[data-usp-figure]"),
        );
        const contents = Array.from(
          section.querySelectorAll<HTMLElement>(".cc-usp-content"),
        );
        const outgoing = figures[index - 1].getBoundingClientRect();
        const incoming = figures[index].getBoundingClientRect();
        const parseInsets = (value: string) =>
          Array.from(value.matchAll(/(-?\d+(?:\.\d+)?)px/g), (match) =>
            Number(match[1]),
          );
        const outgoingInsets = parseInsets(
          getComputedStyle(contents[index - 1]).clipPath,
        );
        const incomingInsets = parseInsets(
          getComputedStyle(contents[index]).clipPath,
        );
        const headline = contents[index - 1]
          .querySelector<HTMLElement>(".cc-usp-headline")!
          .getBoundingClientRect();
        return {
          boundary: outgoing.bottom,
          edgeDelta: Math.abs(outgoing.bottom - incoming.top),
          headlineBottom: headline.bottom,
          headlineTop: headline.top,
          outgoingVisible:
            outgoing.top < window.innerHeight && outgoing.bottom > 0,
          incomingVisible:
            incoming.top < window.innerHeight && incoming.bottom > 0,
          outgoingOpacity: Number(
            getComputedStyle(contents[index - 1]).opacity,
          ),
          incomingOpacity: Number(getComputedStyle(contents[index]).opacity),
          outgoingClipBottom:
            window.innerHeight - outgoingInsets[outgoingInsets.length - 1],
          incomingClipTop: incomingInsets[0],
        };
      },
      incomingIndex,
    );

    expect(Math.abs(handoff.boundary - DESKTOP.height / 2)).toBeLessThanOrEqual(1);
    expect(handoff.headlineTop).toBeLessThan(handoff.boundary);
    expect(handoff.headlineBottom).toBeGreaterThan(handoff.boundary);
    expect(handoff.edgeDelta).toBeLessThanOrEqual(1);
    expect(handoff.outgoingVisible).toBe(true);
    expect(handoff.incomingVisible).toBe(true);
    expect(handoff.outgoingOpacity).toBeCloseTo(0.2, 2);
    expect(handoff.incomingOpacity).toBeCloseTo(0.2, 2);
    expect(Math.abs(handoff.outgoingClipBottom - handoff.boundary)).toBeLessThanOrEqual(
      1,
    );
    expect(Math.abs(handoff.incomingClipTop - handoff.boundary)).toBeLessThanOrEqual(
      1,
    );

    for (let boundaryY = 310; boundaryY <= 590; boundaryY += 20) {
      await jumpTo(page, boundaryPageY - boundaryY);
      const opacities = await page
        .locator(".cc-usp-content")
        .evaluateAll((contents) =>
          contents.map((content) => Number(getComputedStyle(content).opacity)),
        );
      const outgoing = opacities[incomingIndex - 1];
      const incoming = opacities[incomingIndex];
      expect(Math.min(outgoing, incoming)).toBeLessThanOrEqual(0.205);
      expect(Math.max(outgoing, incoming)).toBeGreaterThan(0.01);
    }
  }
});

test("the shared row boundary owns copy opacity, clipping, and text momentum", async ({
  page,
}) => {
  await openDesktop(page);
  const rows = await readRowPageGeometry(page);
  const boundaryPageY = rows[1].pageTop;
  await jumpTo(page, boundaryPageY - DESKTOP.height / 2);

  const crossover = await page.locator(".cc-usp-section").evaluate((section) => {
    const contents = Array.from(
      section.querySelectorAll<HTMLElement>(".cc-usp-content"),
    );
    const row = section.querySelector<HTMLElement>("[data-usp-row='1']")!;
    const outgoing = contents[0];
    const incoming = contents[1];
    return {
      boundaryProgress: Number(row.dataset.boundaryProgress),
      boundaryY: Number(row.dataset.boundaryY),
      incomingBaseOpacity: Number(incoming.dataset.baseOpacity),
      incomingClip: getComputedStyle(incoming).clipPath,
      incomingOpacity: Number(getComputedStyle(incoming).opacity),
      outgoingBaseOpacity: Number(outgoing.dataset.baseOpacity),
      outgoingClip: getComputedStyle(outgoing).clipPath,
      outgoingOpacity: Number(getComputedStyle(outgoing).opacity),
    };
  });

  expect(crossover.boundaryY).toBeCloseTo(DESKTOP.height / 2, 0);
  expect(crossover.boundaryProgress).toBeCloseTo(0.5, 2);
  expect(crossover.outgoingOpacity).toBeCloseTo(0.2, 2);
  expect(crossover.incomingOpacity).toBeCloseTo(0.2, 2);
  expect(crossover.outgoingBaseOpacity).toBeCloseTo(
    crossover.outgoingOpacity,
    3,
  );
  expect(crossover.incomingBaseOpacity).toBeCloseTo(
    crossover.incomingOpacity,
    3,
  );
  expect(crossover.outgoingClip).not.toBe("none");
  expect(crossover.incomingClip).not.toBe("none");

  await jumpTo(page, boundaryPageY - DESKTOP.height / 2 - 80);
  await page.evaluate((target) => {
    const controlledWindow = window as typeof window & {
      __castingCompassLenis?: {
        scrollTo: (
          nextTarget: number,
          options: { duration: number; easing: (time: number) => number },
        ) => void;
      };
    };
    controlledWindow.__castingCompassLenis?.scrollTo(target, {
      duration: 0.16,
      easing: (time) => time,
    });
  }, boundaryPageY - DESKTOP.height / 2);
  await page.waitForTimeout(105);
  const moving = await page.locator(".cc-usp-content").evaluateAll((contents) =>
    contents.slice(0, 2).map((content) => ({
      opacity: Number(getComputedStyle(content).opacity),
      velocityOffset: Number(
        (content as HTMLElement).dataset.velocityOffset ?? "0",
      ),
    })),
  );
  expect(moving[0].opacity).toBeLessThanOrEqual(0.28);
  expect(moving[1].opacity).toBeLessThanOrEqual(0.28);
  expect(Math.abs(moving[0].velocityOffset)).toBeGreaterThan(0.1);
  expect(Math.sign(moving[0].velocityOffset)).toBe(-1);
  expect(Math.sign(moving[1].velocityOffset)).toBe(1);

  await page.waitForTimeout(700);
  const decayed = await page.locator(".cc-usp-content").evaluateAll((contents) =>
    contents
      .slice(0, 2)
      .map((content) =>
        Math.abs(Number((content as HTMLElement).dataset.velocityOffset ?? "0")),
      ),
  );
  expect(Math.max(...decayed)).toBeLessThan(0.75);
});

test("reverse scrolling reproduces row, parallax, clipping, and opacity geometry", async ({
  page,
}) => {
  await openDesktop(page);
  const rows = await readRowPageGeometry(page);
  const checkpoints = [
    rows[1].pageTop - 570,
    rows[1].pageTop - 450,
    rows[1].pageTop - 330,
    rows[2].pageTop - 570,
    rows[2].pageTop - 450,
    rows[2].pageTop - 330,
  ];
  const readState = () =>
    page.locator(".cc-usp-section").evaluate((section) => ({
      rows: Array.from(
        section.querySelectorAll<HTMLElement>("[data-usp-row]"),
      ).map((row) => row.getBoundingClientRect().top),
      opacities: Array.from(
        section.querySelectorAll<HTMLElement>(".cc-usp-content"),
      ).map((content) => Number(getComputedStyle(content).opacity)),
      clips: Array.from(
        section.querySelectorAll<HTMLElement>(".cc-usp-content"),
      ).map((content) => getComputedStyle(content).clipPath),
      parallax: Array.from(
        section.querySelectorAll<HTMLImageElement>("[data-usp-story-asset]"),
      ).map((image) => new DOMMatrixReadOnly(getComputedStyle(image).transform).m42),
    }));

  type ScrollState = Awaited<ReturnType<typeof readState>>;
  const forward: ScrollState[] = [];
  for (const checkpoint of checkpoints) {
    await jumpTo(page, checkpoint);
    forward.push(await readState());
  }
  const reverse: ScrollState[] = [];
  for (const checkpoint of [...checkpoints].reverse()) {
    await jumpTo(page, checkpoint);
    reverse.push(await readState());
  }
  reverse.reverse();

  forward.forEach((state, checkpointIndex) => {
    const reversed = reverse[checkpointIndex];
    state.rows.forEach((top, index) =>
      expect(reversed.rows[index]).toBeCloseTo(top, 1),
    );
    state.opacities.forEach((opacity, index) =>
      expect(reversed.opacities[index]).toBeCloseTo(opacity, 3),
    );
    state.parallax.forEach((translateY, index) =>
      expect(reversed.parallax[index]).toBeCloseTo(translateY, 1),
    );
    expect(reversed.clips).toEqual(state.clips);
  });
});

test("mobile is normal flow, disables settling, and keeps TestFlight in story three", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await stubMarketingPreviewApis(page);
  await page.goto("/");
  await expect(page.locator(".cc-landing")).toHaveClass(/cc-intro-settled/, {
    timeout: 10_000,
  });
  await expect(page.locator("[data-usp-row]")).toHaveCount(3);

  const mobile = await page.locator(".cc-usp-section").evaluate((section) => ({
    settleState: section.getAttribute("data-usp-settle-state"),
    lenis: section.getAttribute("data-usp-lenis"),
    approachMarginTop: getComputedStyle(section).marginTop,
    heroPosition: getComputedStyle(
      document.querySelector<HTMLElement>(".cc-opening-sticky")!,
    ).position,
    stories: Array.from(
      section.querySelectorAll<HTMLElement>("[data-usp-row]"),
    ).map((row) => {
      const content = row.querySelector<HTMLElement>(".cc-usp-content")!;
      const figure = row.querySelector<HTMLElement>("[data-usp-figure]")!;
      const image = figure.querySelector<HTMLImageElement>("img")!;
      const wrapper = figure.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      return {
        rowDisplay: getComputedStyle(row).display,
        contentPosition: getComputedStyle(content).position,
        contentOpacity: getComputedStyle(content).opacity,
        figurePosition: getComputedStyle(figure).position,
        imageTransform: getComputedStyle(image).transform,
        imageWidthRatio: imageRect.width / wrapper.width,
        actionCount: row.querySelectorAll(".cc-testflight-button").length,
      };
    }),
  }));

  expect(mobile.settleState).toBe("disabled");
  expect(mobile.lenis).toBe("inactive");
  expect(mobile.approachMarginTop).toBe("0px");
  expect(mobile.heroPosition).toBe("relative");
  expect(mobile.stories.map((story) => story.actionCount)).toEqual([0, 0, 1]);
  for (const story of mobile.stories) {
    expect(story.rowDisplay).toBe("flex");
    expect(story.contentPosition).toBe("static");
    expect(story.contentOpacity).toBe("1");
    expect(story.figurePosition).not.toBe("fixed");
    expect(story.figurePosition).not.toBe("sticky");
    expect(story.imageTransform).toBe("none");
    expect(story.imageWidthRatio).toBeCloseTo(1, 2);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});
