const fs = require("fs");
const path = require("path");
const model = require("../data-model");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "storage/projects/default.json"), "utf8"));
const normalized = model.normalizeProjectData(seed);
const validation = model.validateProjectData(normalized);

assert(model.COLLECTIONS.characters.entityType === "character", "Expected shared character collection config");
assert(model.ENTITY_TO_COLLECTION.character === "characters", "Expected entity-to-collection mapping");
assert(normalized.revision === 0, "Legacy seed should normalize to revision 0");
assert(normalized.links.every((link) => link.id), "Missing legacy link ids should be filled during normalization");
assert(validation.ok, `Seed project should validate: ${validation.errors.join(", ")}`);

const character = model.normalizeCollectionEntity("characters", { name: "테스트" });
assert(character.entityType === "character", "Collection normalization should return a character entity");
assert(character.name === "테스트", "Collection normalization should preserve fields");

const generatedId = model.createCollectionId("events", normalized);
assert(/^e\d+$/.test(generatedId), `Expected generated event id, got ${generatedId}`);

console.log("Model contract test passed");
