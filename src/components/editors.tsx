import { activeItems, getById, usePlanner } from "../state";
import type { EntityType } from "../types";

export function ProjectInput({ field, label, value }: { field: string; label: string; value: string }) {
  const { actions } = usePlanner();
  return (
    <label className="field-group">
      <span className="field-label">{label}</span>
      <input
        className="edit-input"
        type="text"
        value={value}
        onChange={(event) => actions.updateProjectField(field, event.target.value)}
      />
    </label>
  );
}

export function ProjectTextarea({ field, label, value, rows = 3 }: { field: string; label: string; value: string; rows?: number }) {
  const { actions } = usePlanner();
  return (
    <label className="field-group">
      <span className="field-label">{label}</span>
      <textarea
        className="edit-textarea"
        rows={rows}
        value={value}
        onChange={(event) => actions.updateProjectField(field, event.target.value)}
      />
    </label>
  );
}

export function EditInput({
  type,
  id,
  field,
  label,
  value,
  inputType = "text",
  hint,
}: {
  type: EntityType;
  id: string;
  field: string;
  label: string;
  value: string | number;
  inputType?: string;
  hint?: string;
}) {
  const { actions } = usePlanner();
  return (
    <label className="field-group">
      <span className="field-label">
        {label}
        {hint ? <span>{hint}</span> : null}
      </span>
      <input
        className="edit-input"
        type={inputType}
        value={value ?? ""}
        onChange={(event) => actions.updateField(type, id, field, event.target.value)}
      />
    </label>
  );
}

export function EditTextarea({
  type,
  id,
  field,
  label,
  value,
  rows = 3,
}: {
  type: EntityType;
  id: string;
  field: string;
  label: string;
  value: string;
  rows?: number;
}) {
  const { actions } = usePlanner();
  return (
    <label className="field-group">
      <span className="field-label">{label}</span>
      <textarea
        className="edit-textarea"
        rows={rows}
        value={value ?? ""}
        onChange={(event) => actions.updateField(type, id, field, event.target.value)}
      />
    </label>
  );
}

export function EditSelect({
  type,
  id,
  field,
  label,
  value,
  options,
}: {
  type: EntityType;
  id: string;
  field: string;
  label: string;
  value: string;
  options: string[];
}) {
  const { actions } = usePlanner();
  return (
    <label className="field-group">
      <span className="field-label">{label}</span>
      <select
        className="edit-select"
        value={value}
        onChange={(event) => actions.updateField(type, id, field, event.target.value)}
      >
        {options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EditRange({
  type,
  id,
  field,
  label,
  value,
}: {
  type: EntityType;
  id: string;
  field: string;
  label: string;
  value: number;
}) {
  const { actions } = usePlanner();
  return (
    <label className="field-group">
      <span className="field-label">
        {label}
        <strong>{value}</strong>
      </span>
      <input
        className="edit-range"
        type="range"
        min="1"
        max="10"
        value={value}
        onChange={(event) => actions.updateField(type, id, field, Number(event.target.value))}
      />
    </label>
  );
}

export function RelationChecklist({
  type,
  id,
  field,
  label,
  options,
  tone = "",
}: {
  type: EntityType;
  id: string;
  field: "characters" | "organizations" | "events";
  label: string;
  options: Array<{ id: string; name?: string; title?: string }>;
  tone?: string;
}) {
  const { state, actions } = usePlanner();
  const item = getById(state.data, type, id) as Record<string, unknown> | undefined;
  const selected = new Set(Array.isArray(item?.[field]) ? (item?.[field] as string[]) : []);
  return (
    <section className="relation-editor">
      <div className="field-label">
        {label}
        <span>{selected.size}개 연결됨</span>
      </div>
      <div className="choice-grid">
        {options.map((option) => (
          <label className={`choice-row ${selected.has(option.id) ? "checked" : ""}`} key={option.id}>
            <input
              type="checkbox"
              checked={selected.has(option.id)}
              value={option.id}
              onChange={(event) => actions.updateRelation(type, id, field, option.id, event.target.checked)}
            />
            <span className={`tag ${tone}`}>{option.name || option.title}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

export function ReverseEventChecklist({
  type,
  id,
  label,
  tone = "clay",
}: {
  type: "character" | "organization";
  id: string;
  label: string;
  tone?: string;
}) {
  const { state, actions } = usePlanner();
  const field = type === "character" ? "characters" : "organizations";
  return (
    <section className="relation-editor">
      <div className="field-label">
        {label}
        <span>사건 카드에 바로 반영</span>
      </div>
      <div className="choice-grid">
        {activeItems(state.data.events).map((event) => {
          const checked = event[field].includes(id);
          return (
            <label className={`choice-row ${checked ? "checked" : ""}`} key={event.id}>
              <input
                type="checkbox"
                checked={checked}
                value={event.id}
                onChange={(changeEvent) => actions.updateReverseEventRelation(type, id, event.id, changeEvent.target.checked)}
              />
              <span className={`tag ${tone}`}>{event.title}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
