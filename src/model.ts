import "../data-model.js";
import type { DramaPlannerModel } from "./types";

export const model: DramaPlannerModel = window.DramaPlannerModel;

if (!model) {
  throw new Error("DramaPlannerModel failed to initialize");
}
