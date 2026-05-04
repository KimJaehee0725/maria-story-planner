import { activeItems } from "../../state";
import type { ProjectData } from "../../types";

export function connectedLinks(data: ProjectData, id: string) {
  return activeItems(data.links).filter((link) => link.from === id || link.to === id);
}
