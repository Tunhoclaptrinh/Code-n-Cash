/** Runs in the browser through CDP. Detect blank controls and nearly invisible labels/icons. */
export function inspectButtons() {
  const rgba = (color) => {
    const values = color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
    return [...values.slice(0, 3), values[3] ?? 1];
  };
  const over = (front, back) =>
    front.slice(0, 3).map((v, i) => v * front[3] + back[i] * (1 - front[3]));
  const background = (node) => {
    const layers = [];
    for (let el = node; el; el = el.parentElement)
      layers.unshift(rgba(getComputedStyle(el).backgroundColor));
    return layers.reduce((back, front) => over(front, back), [255, 255, 255]);
  };
  const luminance = (color) =>
    color
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  return [
    ...document.querySelectorAll(
      "button.ant-btn, [role=button].codecash-icon-btn",
    ),
  ]
    .filter(
      (el) =>
        !el.disabled &&
        el.getAttribute("aria-disabled") !== "true" &&
        el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
        el.getBoundingClientRect().width > 0,
    )
    .map((el) => {
      const text = el.innerText.trim();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node, ink;
      while ((node = walker.nextNode())) {
        if (node.textContent.trim()) {
          ink = node.parentElement;
          break;
        }
      }
      ink ??= el.querySelector("svg") ?? el;
      const bg = background(ink),
        fg = over(rgba(getComputedStyle(ink).color), bg);
      const a = luminance(bg),
        b = luminance(fg);
      const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const glyph = !!el.querySelector("svg, img, .anticon");
      const label = el.getAttribute("aria-label") || el.title || text;
      const height = el.getBoundingClientRect().height;
      const expectedHeight = el.classList.contains("codecash-icon-btn")
        ? 30
        : el.classList.contains("ant-btn-lg")
          ? 44
          : 32;
      return {
        label,
        text,
        glyph,
        height: +height.toFixed(2),
        expectedHeight,
        contrast: +contrast.toFixed(2),
        testId: el.dataset.testid ?? null,
        issue:
          !text && !glyph
            ? "BLANK_BUTTON"
            : contrast < 1.5
              ? "INVISIBLE_CONTENT"
              : Math.abs(height - expectedHeight) > 0.75
                ? "INCONSISTENT_BUTTON_HEIGHT"
                : el.closest("[data-testid=table-row-actions]") && !label
                  ? "MISSING_ACTION_LABEL"
                  : null,
      };
    });
}
