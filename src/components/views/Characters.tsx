import { activeItems, matchesQuery, usePlanner } from "../../state";
import { Icon } from "../../ui/icons";
import { EditableHint, PageHeading } from "../common";

export function Characters() {
  const { state, actions } = usePlanner();
  const activeCharacters = activeItems(state.data.characters);
  const filtered = activeCharacters.filter((character) =>
    matchesQuery(
      character as unknown as Record<string, unknown>,
      ["name", "role", "org", "desire", "wound", "secret", "tags"],
      state.query,
    ),
  );
  const selected =
    state.selectedType === "character"
      ? activeCharacters.find((item) => item.id === state.selectedId) || filtered[0] || activeCharacters[0]
      : filtered[0] || activeCharacters[0];

  return (
    <>
      <PageHeading
        title="인물 구성과 심리 아크"
        copy="욕망, 결핍, 비밀, 사건별 감정 변화를 한 화면에서 확인합니다."
      >
        <button className="text-button primary" type="button" onClick={() => actions.createItem("character")}>
          <Icon name="user-plus" />
          인물 추가
        </button>
      </PageHeading>
      <div className="characters-layout">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Cast</p>
              <h3 className="panel-title">주요 인물</h3>
            </div>
          </div>
          <div className="panel-body character-list">
            {filtered.length ? (
              filtered.map((character) => (
                <button
                  className={`character-row ${selected?.id === character.id ? "selected" : ""}`}
                  type="button"
                  key={character.id}
                  onClick={() => actions.select("character", character.id)}
                >
                  <div className="avatar">{character.avatar}</div>
                  <div>
                    <h4 className="character-name">{character.name}</h4>
                    <p className="character-meta">
                      {character.role} · {character.org}
                    </p>
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
              <p className="eyebrow">Character Sheet</p>
              <h3 className="panel-title">{selected?.name || "선택된 인물 없음"}</h3>
            </div>
            <button className="text-button" type="button" onClick={() => actions.setView("graph")}>
              <Icon name="network" />
              관계도에서 보기
            </button>
          </div>
          <div className="panel-body">
            <div className="profile-grid">
              <ProfileField label="욕망" value={selected?.desire || ""} />
              <ProfileField label="결핍/상처" value={selected?.wound || ""} />
              <ProfileField label="비밀" value={selected?.secret || ""} />
              <ProfileField label="내적 모순" value={selected?.contradiction || ""} />
            </div>
            <div className="arc-strip">
              {(selected?.arc || []).map((step, index) => (
                <div className="arc-step" key={`${step}-${index}`}>
                  <strong>{index + 1}단계</strong>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-field">
      <strong>{label}</strong>
      <p>{value}</p>
    </div>
  );
}
