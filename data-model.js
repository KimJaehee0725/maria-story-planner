(function attachDramaPlannerModel(global) {
  const ENTITY_TYPES = Object.freeze({
    PROJECT: "project",
    CHARACTER: "character",
    ORGANIZATION: "organization",
    EVENT: "event",
    EPISODE: "episode",
    LINK: "link",
    ISSUE: "issue",
    SUGGESTION: "suggestion",
  });

  const ID_PREFIX = Object.freeze({
    character: "c",
    organization: "o",
    event: "e",
    episode: "ep",
    link: "l",
    issue: "i",
    suggestion: "s",
  });

  const COLLECTIONS = Object.freeze({
    characters: { entityType: ENTITY_TYPES.CHARACTER, prefix: ID_PREFIX.character, titleField: "name" },
    organizations: { entityType: ENTITY_TYPES.ORGANIZATION, prefix: ID_PREFIX.organization, titleField: "name" },
    events: { entityType: ENTITY_TYPES.EVENT, prefix: ID_PREFIX.event, titleField: "title" },
    episodes: { entityType: ENTITY_TYPES.EPISODE, prefix: ID_PREFIX.episode, titleField: "title" },
    links: { entityType: ENTITY_TYPES.LINK, prefix: ID_PREFIX.link, titleField: "label" },
    issues: { entityType: ENTITY_TYPES.ISSUE, prefix: ID_PREFIX.issue, titleField: "title" },
    suggestions: { entityType: ENTITY_TYPES.SUGGESTION, prefix: ID_PREFIX.suggestion, titleField: "title" },
  });

  const ENTITY_TO_COLLECTION = Object.freeze(
    Object.fromEntries(Object.entries(COLLECTIONS).map(([collection, config]) => [config.entityType, collection])),
  );

  const PHASES = Object.freeze(["과거", "Act 1", "Act 2", "Act 3"]);
  const REVIEW_STATES = Object.freeze(["draft", "needs_review", "accepted", "rejected"]);
  const LLM_OPERATION_TYPES = Object.freeze([
    "create_entity",
    "update_fields",
    "link_entities",
    "unlink_entities",
    "add_suggestion",
  ]);

  function nowIso() {
    return new Date().toISOString();
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null || value === "") return [];
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function confidenceValue(value, fallback = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(1, numeric));
  }

  function revisionValue(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
  }

  function normalizeProvenance(value = {}) {
    return {
      source: value.source || "human",
      sourceText: value.sourceText || "",
      sourceRange: value.sourceRange || null,
      importedAt: value.importedAt || nowIso(),
    };
  }

  function normalizeReview(value = {}) {
    return {
      state: REVIEW_STATES.includes(value.state) ? value.state : "accepted",
      confidence: confidenceValue(value.confidence, 1),
      reviewedBy: value.reviewedBy || "",
      reviewedAt: value.reviewedAt || "",
    };
  }

  function baseEntity(type, overrides = {}) {
    const createdAt = overrides.createdAt || nowIso();
    return {
      id: overrides.id || "",
      entityType: type,
      status: overrides.status || "active",
      createdAt,
      updatedAt: overrides.updatedAt || createdAt,
      createdBy: overrides.createdBy || "human",
      provenance: normalizeProvenance(overrides.provenance),
      review: normalizeReview(overrides.review),
      notes: overrides.notes || "",
    };
  }

  function createCharacter(overrides = {}) {
    return {
      ...baseEntity(ENTITY_TYPES.CHARACTER, overrides),
      name: overrides.name || "새 인물",
      role: overrides.role || "역할 미정",
      org: overrides.org || "소속 미정",
      avatar: overrides.avatar || "신규",
      desire: overrides.desire || "",
      wound: overrides.wound || "",
      secret: overrides.secret || "",
      contradiction: overrides.contradiction || "",
      arc: asArray(overrides.arc).length ? asArray(overrides.arc) : ["도입", "선택", "균열", "전환", "대가", "결말"],
      tags: asArray(overrides.tags).length ? asArray(overrides.tags) : ["초안"],
    };
  }

  function createOrganization(overrides = {}) {
    return {
      ...baseEntity(ENTITY_TYPES.ORGANIZATION, overrides),
      name: overrides.name || "새 조직",
      type: overrides.type || "유형 미정",
      agenda: overrides.agenda || "",
      leverage: overrides.leverage || "",
      risk: overrides.risk || "",
      tags: asArray(overrides.tags).length ? asArray(overrides.tags) : ["초안"],
    };
  }

  function createEvent(overrides = {}) {
    return {
      ...baseEntity(ENTITY_TYPES.EVENT, overrides),
      title: overrides.title || "새 사건",
      date: overrides.date || "시점 미정",
      phase: PHASES.includes(overrides.phase) ? overrides.phase : "Act 1",
      summary: overrides.summary || "",
      characters: asArray(overrides.characters),
      organizations: asArray(overrides.organizations),
      emotion: overrides.emotion || "",
      impact: Number.isFinite(Number(overrides.impact)) ? Number(overrides.impact) : 5,
      tags: asArray(overrides.tags).length ? asArray(overrides.tags) : ["초안"],
    };
  }

  function createEpisode(overrides = {}) {
    return {
      ...baseEntity(ENTITY_TYPES.EPISODE, overrides),
      title: overrides.title || "새 회차",
      act: PHASES.includes(overrides.act) && overrides.act !== "과거" ? overrides.act : "Act 1",
      hook: overrides.hook || "",
      turn: overrides.turn || "",
      payoff: overrides.payoff || "",
      events: asArray(overrides.events),
      characters: asArray(overrides.characters),
    };
  }

  function createLink(overrides = {}) {
    return {
      ...baseEntity(ENTITY_TYPES.LINK, overrides),
      from: overrides.from || "",
      to: overrides.to || "",
      type: overrides.type || "관계",
      label: overrides.label || "",
      direction: overrides.direction || "bidirectional",
      strength: Number.isFinite(Number(overrides.strength)) ? Number(overrides.strength) : 5,
    };
  }

  function createIssue(overrides = {}) {
    return {
      ...baseEntity(ENTITY_TYPES.ISSUE, overrides),
      title: overrides.title || "새 점검 항목",
      summary: overrides.summary || "",
      target: overrides.target || "",
      type: overrides.type || "event",
      priority: overrides.priority || "medium",
      resolved: Boolean(overrides.resolved),
    };
  }

  function createSuggestion(overrides = {}) {
    return {
      ...baseEntity(ENTITY_TYPES.SUGGESTION, {
        ...overrides,
        createdBy: overrides.createdBy || "llm",
        review: overrides.review || { state: "needs_review", confidence: overrides.confidence ?? 0.6 },
      }),
      title: overrides.title || "새 제안",
      body: overrides.body || "",
      targetType: overrides.targetType || "",
      targetId: overrides.targetId || "",
      operation: overrides.operation || null,
    };
  }

  function createEntity(type, overrides = {}) {
    const factories = {
      character: createCharacter,
      organization: createOrganization,
      event: createEvent,
      episode: createEpisode,
      link: createLink,
      issue: createIssue,
      suggestion: createSuggestion,
    };
    return factories[type]?.(overrides);
  }

  function normalizeEntity(type, item = {}) {
    return createEntity(type, item);
  }

  function createId(prefix, collection) {
    const next =
      collection.reduce((max, item) => {
        const value = Number(String(item.id).replace(prefix, ""));
        return Number.isFinite(value) ? Math.max(max, value) : max;
      }, 0) + 1;
    return `${prefix}${next}`;
  }

  function createCollectionId(collection, projectData) {
    const config = COLLECTIONS[collection];
    if (!config) throw new Error(`Unknown entity collection: ${collection}`);
    return createId(config.prefix, projectData[collection]);
  }

  function normalizeCollectionEntity(collection, item = {}) {
    const config = COLLECTIONS[collection];
    if (!config) throw new Error(`Unknown entity collection: ${collection}`);
    return normalizeEntity(config.entityType, item);
  }

  function fillMissingEntityIds(projectData) {
    [
      ["characters", ID_PREFIX.character],
      ["organizations", ID_PREFIX.organization],
      ["events", ID_PREFIX.event],
      ["episodes", ID_PREFIX.episode],
      ["links", ID_PREFIX.link],
      ["issues", ID_PREFIX.issue],
      ["suggestions", ID_PREFIX.suggestion],
    ].forEach(([collection, prefix]) => {
      projectData[collection].forEach((item) => {
      if (!item.id) item.id = createId(prefix, projectData[collection]);
      });
    });
  }

  function normalizeProjectData(raw = {}) {
    const createdAt = raw.project?.createdAt || nowIso();
    const projectData = {
      revision: revisionValue(raw.revision),
      project: {
        id: raw.project?.id || "project-1",
        entityType: ENTITY_TYPES.PROJECT,
        title: raw.project?.title || "무제",
        genre: raw.project?.genre || "",
        logline: raw.project?.logline || "",
        tone: asArray(raw.project?.tone),
        format: raw.project?.format || "series",
        language: raw.project?.language || "ko",
        status: raw.project?.status || "draft",
        createdAt,
        updatedAt: raw.project?.updatedAt || createdAt,
      },
      characters: (raw.characters || []).map((item) => normalizeEntity("character", item)),
      organizations: (raw.organizations || []).map((item) => normalizeEntity("organization", item)),
      events: (raw.events || []).map((item) => normalizeEntity("event", item)),
      episodes: (raw.episodes || []).map((item) => normalizeEntity("episode", item)),
      links: (raw.links || []).map((item) => normalizeEntity("link", item)),
      issues: (raw.issues || []).map((item) => normalizeEntity("issue", item)),
      suggestions: (raw.suggestions || []).map((item) => normalizeEntity("suggestion", item)),
      llmIntakes: raw.llmIntakes || [],
      operationLog: raw.operationLog || [],
      savedAt: raw.savedAt || "",
    };
    fillMissingEntityIds(projectData);
    return projectData;
  }

  function allEntityIds(projectData) {
    return new Set([
      ...projectData.characters.map((item) => item.id),
      ...projectData.organizations.map((item) => item.id),
      ...projectData.events.map((item) => item.id),
      ...projectData.episodes.map((item) => item.id),
    ]);
  }

  function validateProjectData(projectData) {
    const errors = [];
    const warnings = [];
    const idList = [
      ...projectData.characters.map((item) => item.id),
      ...projectData.organizations.map((item) => item.id),
      ...projectData.events.map((item) => item.id),
      ...projectData.episodes.map((item) => item.id),
      ...projectData.links.map((item) => item.id),
      ...projectData.issues.map((item) => item.id),
      ...projectData.suggestions.map((item) => item.id),
    ];
    const ids = allEntityIds(projectData);
    const seen = new Set();

    idList.forEach((id) => {
      if (!id) errors.push("id가 비어 있음");
      if (seen.has(id)) errors.push(`중복 id: ${id}`);
      seen.add(id);
    });

    projectData.events.forEach((event) => {
      event.characters.forEach((id) => {
        if (!ids.has(id)) errors.push(`${event.title}의 인물 연결이 존재하지 않음: ${id}`);
      });
      event.organizations.forEach((id) => {
        if (!ids.has(id)) errors.push(`${event.title}의 조직 연결이 존재하지 않음: ${id}`);
      });
      if (!event.summary) warnings.push(`${event.title}: 사건 개요 비어 있음`);
      if (!event.emotion) warnings.push(`${event.title}: 심리 변화 비어 있음`);
      if (!event.characters.length) warnings.push(`${event.title}: 연결 인물 없음`);
    });

    projectData.episodes.forEach((episode) => {
      episode.events.forEach((id) => {
        if (!ids.has(id)) errors.push(`${episode.title}의 사건 연결이 존재하지 않음: ${id}`);
      });
      episode.characters.forEach((id) => {
        if (!ids.has(id)) errors.push(`${episode.title}의 인물 연결이 존재하지 않음: ${id}`);
      });
    });

    projectData.links.forEach((link) => {
      if (!ids.has(link.from)) errors.push(`관계 시작점이 존재하지 않음: ${link.from}`);
      if (!ids.has(link.to)) errors.push(`관계 도착점이 존재하지 않음: ${link.to}`);
    });

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      stats: {
        characters: projectData.characters.length,
        organizations: projectData.organizations.length,
        events: projectData.events.length,
        episodes: projectData.episodes.length,
        links: projectData.links.length,
        suggestions: projectData.suggestions.length,
      },
    };
  }

  function createLLMIntake({ text, intent = "parse_and_suggest", scope = "project", source = "chat" }) {
    return {
      id: `intake-${Date.now()}`,
      text,
      intent,
      scope,
      source,
      createdAt: nowIso(),
      operations: [],
      suggestions: [],
      status: "pending",
    };
  }

  function createLLMOperation(type, payload = {}) {
    if (!LLM_OPERATION_TYPES.includes(type)) {
      throw new Error(`Unknown LLM operation type: ${type}`);
    }
    return {
      id: `op-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      payload,
      confidence: confidenceValue(payload.confidence, 0.6),
      requiresReview: payload.requiresReview ?? true,
      createdAt: nowIso(),
    };
  }

  global.DramaPlannerModel = {
    ENTITY_TYPES,
    ID_PREFIX,
    PHASES,
    REVIEW_STATES,
    LLM_OPERATION_TYPES,
    COLLECTIONS,
    ENTITY_TO_COLLECTION,
    nowIso,
    asArray,
    revisionValue,
    createId,
    createCollectionId,
    createEntity,
    normalizeEntity,
    normalizeCollectionEntity,
    normalizeProjectData,
    validateProjectData,
    createLLMIntake,
    createLLMOperation,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) {
  module.exports = globalThis.DramaPlannerModel;
}
