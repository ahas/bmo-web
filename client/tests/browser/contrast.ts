import type { Page } from "playwright-core";

// The contrast an element's words are drawn at against the ground under them, each colour read back as the browser
// paints it and a translucent one laid over what stands beneath.
export async function contrast(page: Page, selector: string): Promise<{ text: string; ratio: number }[]> {
  return await page.locator(selector).evaluateAll((elements) => {
    const canvas = document.createElement("canvas");
    const pen = canvas.getContext("2d", { willReadFrequently: true })!;

    canvas.width = canvas.height = 1;

    const painted = (colour: string): [number, number, number, number] => {
      pen.clearRect(0, 0, 1, 1);
      pen.fillStyle = colour;
      pen.fillRect(0, 0, 1, 1);

      const [r, g, b, a] = pen.getImageData(0, 0, 1, 1).data;

      return [r!, g!, b!, a! / 255];
    };
    const over = (top: [number, number, number, number], under: [number, number, number]): [number, number, number] =>
      [0, 1, 2].map((at) => top[at]! * top[3] + under[at]! * (1 - top[3])) as [number, number, number];
    const ground = (element: Element | null): [number, number, number] => {
      const layers: [number, number, number, number][] = [];

      for (let one = element; one !== null; one = one.parentElement) {
        const layer = painted(getComputedStyle(one).backgroundColor);

        if (layer[3] > 0) layers.push(layer);
        if (layer[3] === 1) break;
      }

      return layers.reverse().reduce<[number, number, number]>((under, layer) => over(layer, under), [255, 255, 255]);
    };
    const light = (rgb: [number, number, number]): number => {
      const [r, g, b] = rgb.map((value) => {
        const channel = value / 255;

        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });

      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };

    return elements
      .filter((element) => (element as HTMLElement).innerText.trim() !== "")
      .map((element) => {
        const under = ground(element);
        const words = over(painted(getComputedStyle(element).color), under);
        const [high, low] = [light(words), light(under)].sort((a, b) => b - a);

        return { text: (element as HTMLElement).innerText.trim(), ratio: Math.round(((high! + 0.05) / (low! + 0.05)) * 100) / 100 };
      });
  });
}
