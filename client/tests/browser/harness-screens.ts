import { SCREENS } from "../../apps/web/app/domain/screens";
import { HARNESS_SCREEN_UNITS } from "../support/harness-screens";

// The screens the harness's sidebar leads to: home, every screen of the console's own, and the screens its stand-in
// units bring. A screen a real unit brings and no stand-in serves stands nowhere there.
export function harnessScreens(): string[] {
  return ["/", ...SCREENS.filter((screen) => screen.brought !== true).map((screen) => screen.to), ...HARNESS_SCREEN_UNITS.map((name) => `/${name}`)];
}
