import { activeItems, usePlanner } from "../../state";
import type { Episode } from "../../types";
import { EditInput, EditSelect, EditTextarea, RelationChecklist } from "../editors";
import { EditorHeader } from "./EditorHeader";

export function EpisodeDetail({ episode }: { episode: Episode }) {
  const { state } = usePlanner();
  return (
    <>
      <EditorHeader kind="Episode Editor" title={episode.title} subtitle={episode.act} />
      <form className="edit-form" onSubmit={(event) => event.preventDefault()}>
        <section className="detail-section">
          <EditInput type="episode" id={episode.id} field="title" label="회차명" value={episode.title} />
          <EditSelect type="episode" id={episode.id} field="act" label="구간" value={episode.act} options={["Act 1", "Act 2", "Act 3"]} />
        </section>
        <section className="detail-section">
          <EditTextarea type="episode" id={episode.id} field="hook" label="Hook" value={episode.hook} />
          <EditTextarea type="episode" id={episode.id} field="turn" label="전환점" value={episode.turn} />
          <EditTextarea type="episode" id={episode.id} field="payoff" label="떡밥 회수" value={episode.payoff} />
        </section>
        <section className="detail-section">
          <RelationChecklist type="episode" id={episode.id} field="events" label="연결 사건" options={activeItems(state.data.events)} tone="clay" />
          <RelationChecklist type="episode" id={episode.id} field="characters" label="등장 인물" options={activeItems(state.data.characters)} tone="sage" />
        </section>
      </form>
    </>
  );
}
