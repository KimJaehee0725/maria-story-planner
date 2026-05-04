import { displayTitle, labelForType, usePlanner } from "../../state";
import { Icon } from "../../ui/icons";

export function ArchiveSection() {
  const { state, actions } = usePlanner();
  const archived = [
    ...state.data.characters.filter((item) => item.status === "archived").map((item) => ({ type: "character" as const, item })),
    ...state.data.organizations
      .filter((item) => item.status === "archived")
      .map((item) => ({ type: "organization" as const, item })),
    ...state.data.events.filter((item) => item.status === "archived").map((item) => ({ type: "event" as const, item })),
    ...state.data.episodes.filter((item) => item.status === "archived").map((item) => ({ type: "episode" as const, item })),
  ];

  if (!archived.length) {
    return (
      <section className="detail-section archive-section">
        <h3>휴지통</h3>
        <p>삭제한 항목이 없습니다.</p>
      </section>
    );
  }

  return (
    <section className="detail-section archive-section">
      <h3>휴지통</h3>
      <div className="link-list">
        {archived.map(({ type, item }) => (
          <div className="archive-item" key={`${type}-${item.id}`}>
            <div>
              <strong>{displayTitle(item)}</strong>
              <span>{labelForType(type)} · 저장 전까지 목록에서 숨겨집니다.</span>
            </div>
            <button className="text-button" type="button" onClick={() => actions.restoreArchived(type, item.id)}>
              <Icon name="rotate-ccw" />
              복구
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
