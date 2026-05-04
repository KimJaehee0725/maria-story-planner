import { usePlanner } from "../../state";
import { Icon } from "../../ui/icons";
import type { PlannerEntity } from "../../types";

export function ReadOnlyDetail({ item }: { item: PlannerEntity }) {
  const { state, actions } = usePlanner();
  const title = "name" in item ? item.name : item.title;
  const subtitle =
    ("role" in item && item.role) ||
    ("type" in item && item.type) ||
    ("date" in item && item.date) ||
    ("act" in item && item.act) ||
    "";
  const body =
    ("summary" in item && item.summary) ||
    ("contradiction" in item && item.contradiction) ||
    ("agenda" in item && item.agenda) ||
    ("hook" in item && [item.hook, item.turn, item.payoff].filter(Boolean).join(" / ")) ||
    "내용이 비어 있습니다.";

  return (
    <>
      <div className="detail-header">
        <p className="eyebrow">{state.selectedType}</p>
        <h2 className="detail-title">{title}</h2>
        <p className="detail-subtitle">{subtitle}</p>
      </div>
      <section className="detail-section">
        <h3>요약</h3>
        <p>{body}</p>
      </section>
      <section className="detail-section">
        <button className="text-button primary" type="button" onClick={actions.toggleEditMode}>
          <Icon name="square-pen" />
          편집 모드로 전환
        </button>
      </section>
    </>
  );
}
