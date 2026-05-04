import { model } from "../../model";
import { activeItems, isActive, usePlanner } from "../../state";
import { Icon } from "../../ui/icons";
import type { EntityType } from "../../types";
import { OrgTags, PageHeading, PeopleTags } from "../common";
import { ProjectInput, ProjectTextarea } from "../editors";

export function Dashboard() {
  const { state, actions } = usePlanner();
  const { data } = state;
  const health = model.validateProjectData(data);
  const activeEvents = activeItems(data.events);
  const activeCharacters = activeItems(data.characters);
  const activeOrganizations = activeItems(data.organizations);
  const pins = activeEvents.slice(0, 6);
  const warnings = health.warnings.slice(0, 3);

  return (
    <>
      <PageHeading title={`${data.project.title} 작업실`} copy={data.project.logline}>
        <button className="text-button primary" type="button" onClick={() => actions.createItem("event")}>
          <Icon name="plus" />
          사건 추가
        </button>
      </PageHeading>

      <div className="metric-grid">
        <div className="metric">
          <span>인물</span>
          <strong>{activeCharacters.length}</strong>
        </div>
        <div className="metric">
          <span>주요 사건</span>
          <strong>{activeEvents.length}</strong>
        </div>
        <div className="metric">
          <span>조직/기관</span>
          <strong>{activeOrganizations.length}</strong>
        </div>
        <div className="metric">
          <span>모델 경고</span>
          <strong>{health.warnings.length}</strong>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Story Spine</p>
              <h3 className="panel-title">핵심 사건 흐름</h3>
            </div>
            <button className="text-button" type="button" onClick={() => actions.setView("timeline")}>
              <Icon name="git-commit-horizontal" />
              타임라인 보기
            </button>
          </div>
          <div className="panel-body">
            <div className="story-map">
              <div className="map-rail" />
              {pins.map((event, index) => {
                const top = index % 2 === 0;
                const left = 4 + index * 15.4;
                return (
                  <button
                    className={`map-pin ${top ? "top" : "bottom"}`}
                    style={top ? { left: `${left}%`, top: 34 } : { left: `${left}%`, bottom: 34 }}
                    type="button"
                    key={event.id}
                    onClick={() => actions.select("event", event.id)}
                  >
                    <h4>{event.title}</h4>
                    <p>{event.date}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <div className="quick-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Data Model</p>
                <h3 className="panel-title">LLM 입력 준비 상태</h3>
              </div>
            </div>
            <div className="panel-body issue-list">
              <div className="thread-item">
                <strong>{health.ok ? "참조 무결성 정상" : "참조 오류 확인 필요"}</strong>
                <span>인물, 조직, 사건, 회차의 ID 연결을 검사합니다.</span>
              </div>
              {(warnings.length ? warnings : ["주요 필드는 현재 충분히 채워져 있습니다."]).map((warning) => (
                <div className="thread-item" key={warning}>
                  <strong>검토 항목</strong>
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Project Brief</p>
                <h3 className="panel-title">작품 기본 정보</h3>
              </div>
            </div>
            <div className="panel-body project-editor">
              <ProjectInput field="title" label="작품명" value={data.project.title} />
              <ProjectInput field="genre" label="장르" value={data.project.genre} />
              <ProjectTextarea field="logline" label="로그라인" value={data.project.logline} rows={4} />
              <ProjectInput field="tone" label="톤 키워드" value={data.project.tone.join(", ")} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Open Threads</p>
                <h3 className="panel-title">설정 보강 알림</h3>
              </div>
            </div>
            <div className="panel-body issue-list">
              {data.issues.filter(isActive).map((issue) => (
                <div className="thread-item" key={issue.id}>
                  <strong>{issue.title}</strong>
                  <span>{issue.summary}</span>
                  <button type="button" onClick={() => actions.select(issue.type as EntityType, issue.target)}>
                    <Icon name="arrow-right" />
                    연결 항목 보기
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
