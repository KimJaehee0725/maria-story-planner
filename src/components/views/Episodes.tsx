import { activeItems, matchesQuery, usePlanner } from "../../state";
import { Icon } from "../../ui/icons";
import type { Episode } from "../../types";
import { EditableHint, PageHeading, PeopleTags } from "../common";

export function Episodes() {
  const { state, actions } = usePlanner();
  const acts: Array<[string, string]> = [
    ["Act 1", "발견과 첫 충돌"],
    ["Act 2", "정체성 붕괴와 압박"],
    ["Act 3", "증언과 송출"],
  ];
  const filtered = activeItems(state.data.episodes).filter((episode) =>
    matchesQuery(episode as unknown as Record<string, unknown>, ["title", "hook", "turn", "payoff"], state.query),
  );

  return (
    <>
      <PageHeading
        title="회차별 사건, 감정 전환, 떡밥 회수"
        copy="초기 기획 단계에서는 회차 대신 Act 단위로도 사용할 수 있게 구성합니다."
      >
        <button className="text-button primary" type="button" onClick={() => actions.createItem("episode")}>
          <Icon name="plus" />
          회차 추가
        </button>
      </PageHeading>
      <div className="episode-board">
        {acts.map(([act, desc]) => {
          const episodes = filtered.filter((episode) => episode.act === act);
          return (
            <section className="episode-column" key={act}>
              <div className="episode-column-header">
                <h3>{act}</h3>
                <p>{desc}</p>
              </div>
              <div className="episode-stack">
                {episodes.length ? episodes.map((episode) => <EpisodeCard episode={episode} key={episode.id} />) : <div className="empty-state">검색 결과 없음</div>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function EpisodeCard({ episode }: { episode: Episode }) {
  const { actions } = usePlanner();
  return (
    <button className="episode-card" type="button" onClick={() => actions.select("episode", episode.id)}>
      <h4>{episode.title}</h4>
      <p>{episode.hook}</p>
      <div className="beat-row">
        <div className="beat">
          <strong>전환</strong>
          <span>{episode.turn}</span>
        </div>
        <div className="beat">
          <strong>회수</strong>
          <span>{episode.payoff}</span>
        </div>
      </div>
      <div className="tag-row" style={{ marginTop: 10 }}>
        <PeopleTags ids={episode.characters} />
        <EditableHint />
      </div>
    </button>
  );
}
