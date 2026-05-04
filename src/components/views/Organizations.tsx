import { activeItems, matchesQuery, usePlanner } from "../../state";
import { Icon } from "../../ui/icons";
import { EditableHint, PageHeading, TagRow } from "../common";

export function Organizations() {
  const { state, actions } = usePlanner();
  const filtered = activeItems(state.data.organizations).filter((org) =>
    matchesQuery(org as unknown as Record<string, unknown>, ["name", "type", "agenda", "leverage", "risk", "tags"], state.query),
  );

  return (
    <>
      <PageHeading
        title="조직별 목적, 압박 수단, 리스크"
        copy="기관이 왜 움직이는지 정리하면 인물의 선택과 사건의 원인이 더 선명해집니다."
      >
        <button className="text-button primary" type="button" onClick={() => actions.createItem("organization")}>
          <Icon name="building-2" />
          조직 추가
        </button>
      </PageHeading>
      <div className="org-layout">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Institutions</p>
              <h3 className="panel-title">조직/기관 목록</h3>
            </div>
          </div>
          <div className="panel-body org-list">
            {filtered.length ? (
              filtered.map((org) => (
                <button className="org-row" type="button" key={org.id} onClick={() => actions.select("organization", org.id)}>
                  <div>
                    <h4>{org.name}</h4>
                    <p>{org.agenda}</p>
                    <TagRow values={org.tags} tone="ochre" />
                  </div>
                  <EditableHint />
                </button>
              ))
            ) : (
              <div className="empty-state">검색 결과가 없습니다.</div>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Pressure Matrix</p>
              <h3 className="panel-title">조직 간 이해관계</h3>
            </div>
          </div>
          <div className="panel-body matrix">
            <div className="matrix-row">
              <strong>해림개발 → 도시재생청</strong>
              <span>인허가 압박</span>
            </div>
            <div className="matrix-row">
              <strong>한강콘텐츠 → 해림개발</strong>
              <span>방송 폭로 위협</span>
            </div>
            <div className="matrix-row">
              <strong>서래경찰서 → 한강콘텐츠</strong>
              <span>비공식 자료 제공</span>
            </div>
            <div className="matrix-row">
              <strong>달빛보육원 → 전 조직</strong>
              <span>과거 기록의 원천</span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
