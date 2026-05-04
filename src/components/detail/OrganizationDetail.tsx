import { activeItems, usePlanner } from "../../state";
import { Icon } from "../../ui/icons";
import type { Organization } from "../../types";
import { EditInput, EditTextarea, ReverseEventChecklist } from "../editors";
import { EditorHeader } from "./EditorHeader";

export function OrganizationDetail({ org }: { org: Organization }) {
  const { state, actions } = usePlanner();
  const events = activeItems(state.data.events).filter((event) => event.organizations.includes(org.id));
  return (
    <>
      <EditorHeader kind="Organization Editor" title={org.name} subtitle={org.type} />
      <form className="edit-form" onSubmit={(event) => event.preventDefault()}>
        <section className="detail-section">
          <EditInput type="organization" id={org.id} field="name" label="조직명" value={org.name} />
          <EditInput type="organization" id={org.id} field="type" label="유형" value={org.type} />
          <EditInput type="organization" id={org.id} field="tags" label="태그" value={org.tags.join(", ")} hint="쉼표로 구분" />
        </section>
        <section className="detail-section">
          <EditTextarea type="organization" id={org.id} field="agenda" label="목적" value={org.agenda} />
          <EditTextarea type="organization" id={org.id} field="leverage" label="압박 수단" value={org.leverage} />
          <EditTextarea type="organization" id={org.id} field="risk" label="리스크" value={org.risk} />
        </section>
        <section className="detail-section">
          <ReverseEventChecklist type="organization" id={org.id} label="관련 사건 연결" tone="ochre" />
        </section>
      </form>
      <section className="detail-section">
        <h3>관련 사건</h3>
        <div className="tag-row">
          {events.map((event) => (
            <button className="chip-button" type="button" key={event.id} onClick={() => actions.select("event", event.id)}>
              {event.title}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
