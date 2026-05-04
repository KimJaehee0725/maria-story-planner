import { activeItems, usePlanner } from "../../state";
import { Icon } from "../../ui/icons";
import type { EventEntity } from "../../types";
import { EditInput, EditRange, EditSelect, EditTextarea, RelationChecklist } from "../editors";
import { EditorHeader } from "./EditorHeader";

export function EventDetail({ event }: { event: EventEntity }) {
  const { state, actions } = usePlanner();
  return (
    <>
      <EditorHeader kind="Event Editor" title={event.title} subtitle={`${event.date} · ${event.phase}`} />
      <form className="edit-form" onSubmit={(submitEvent) => submitEvent.preventDefault()}>
        <section className="detail-section">
          <EditInput type="event" id={event.id} field="title" label="사건명" value={event.title} />
          <div className="inline-field-grid">
            <EditInput type="event" id={event.id} field="date" label="시점/회차" value={event.date} />
            <EditSelect type="event" id={event.id} field="phase" label="구간" value={event.phase} options={["과거", "Act 1", "Act 2", "Act 3"]} />
          </div>
          <EditRange type="event" id={event.id} field="impact" label="서사 영향도" value={event.impact} />
          <EditInput type="event" id={event.id} field="tags" label="태그" value={event.tags.join(", ")} hint="쉼표로 구분" />
        </section>
        <section className="detail-section">
          <EditTextarea type="event" id={event.id} field="summary" label="사건 개요" value={event.summary} rows={4} />
          <EditTextarea type="event" id={event.id} field="emotion" label="타임라인 별 인물 심리" value={event.emotion} rows={4} />
        </section>
        <section className="detail-section">
          <RelationChecklist type="event" id={event.id} field="characters" label="관련 인물" options={activeItems(state.data.characters)} tone="sage" />
          <RelationChecklist type="event" id={event.id} field="organizations" label="관련 조직/기관" options={activeItems(state.data.organizations)} tone="ochre" />
        </section>
      </form>
      <section className="detail-section">
        <div className="detail-actions">
          <button className="text-button" type="button" onClick={() => actions.setView("timeline")}>
            <Icon name="git-commit-horizontal" />
            타임라인
          </button>
          <button className="text-button" type="button" onClick={() => actions.setView("graph")}>
            <Icon name="network" />
            관계도
          </button>
        </div>
      </section>
    </>
  );
}
