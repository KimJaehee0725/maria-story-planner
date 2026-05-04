import type { ReactNode } from "react";
import { viewMeta } from "./app-config";
import { DetailRail } from "./components/DetailRail";
import { Dashboard, Timeline, Characters, Graph, Episodes, Organizations } from "./components/views";
import { LlmDrawer } from "./llm/LlmDrawer";
import { PlannerProvider, usePlanner } from "./state";
import { Icon, type IconName } from "./ui/icons";
import type { ViewName } from "./types";

export default function App() {
  return (
    <PlannerProvider>
      <AppShell />
    </PlannerProvider>
  );
}

function AppShell() {
  const { state, actions } = usePlanner();
  const [kicker, title] = viewMeta[state.view];

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar" aria-label="프로젝트 내비게이션">
          <div className="project-switcher">
            <div className="mark">SB</div>
            <div>
              <p className="eyebrow">Drama Bible</p>
              <h1>숨은 컷</h1>
            </div>
          </div>
          <nav className="nav-list">
            <NavButton view="dashboard" icon="layout-dashboard" label="대시보드" />
            <NavButton view="timeline" icon="git-commit-horizontal" label="타임라인" />
            <NavButton view="characters" icon="users-round" label="인물 구성" />
            <NavButton view="graph" icon="network" label="관계도" />
            <NavButton view="episodes" icon="columns-3" label="회차 보드" />
            <NavButton view="organizations" icon="building-2" label="조직/기관" />
          </nav>
          <div className="sidebar-block">
            <p className="eyebrow">기획 상태</p>
            <div className="meter">
              <span style={{ width: "68%" }} />
            </div>
            <div className="sidebar-row">
              <span>세계관 연결도</span>
              <strong>68%</strong>
            </div>
          </div>
          <div className="sidebar-block compact">
            <p className="eyebrow">오늘 점검</p>
            <button className="quiet-button" type="button" onClick={() => actions.setView("timeline")}>
              <Icon name="alert-triangle" />
              사건 3개 심리 동기 보강
            </button>
            <button className="quiet-button" type="button" onClick={() => actions.setView("graph")}>
              <Icon name="link" />
              조직 연결 2개 미확정
            </button>
          </div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div>
              <p className="eyebrow">{kicker}</p>
              <h2>{title}</h2>
            </div>
            <div className="topbar-actions">
              <label className="search-box" aria-label="검색">
                <Icon name="search" />
                <input
                  type="search"
                  placeholder="인물, 사건, 조직 검색"
                  value={state.query}
                  onChange={(event) => actions.setQuery(event.target.value.trim())}
                />
              </label>
              <button
                className={`text-button edit-toggle ${state.editMode ? "active" : ""}`}
                type="button"
                title="편집 모드"
                onClick={actions.toggleEditMode}
              >
                <Icon name="square-pen" />
                <span>{state.editMode ? "편집" : "보기"}</span>
              </button>
              <button className="icon-button" type="button" title="새 항목" onClick={actions.createItemForCurrentView}>
                <Icon name="plus" />
              </button>
              <button className="icon-button" type="button" title="내보내기는 다음 단계에서 지원됩니다" disabled>
                <Icon name="download" />
              </button>
            </div>
          </header>

          <main id="main-panel" className="main-panel" tabIndex={-1}>
            <MainPanel />
          </main>
        </section>

        <aside className="detail-rail" aria-label="선택 항목 상세">
          <div id="detail-panel">
            <DetailRail />
          </div>
        </aside>
      </div>
      <LlmDrawer />
    </>
  );
}

function NavButton({ view, icon, label }: { view: ViewName; icon: IconName; label: string }) {
  const { state, actions } = usePlanner();
  return (
    <button
      className={`nav-item ${state.view === view ? "active" : ""}`}
      type="button"
      onClick={() => actions.setView(view)}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

function MainPanel() {
  const { state } = usePlanner();
  const renderers: Record<ViewName, ReactNode> = {
    dashboard: <Dashboard />,
    timeline: <Timeline />,
    characters: <Characters />,
    graph: <Graph />,
    episodes: <Episodes />,
    organizations: <Organizations />,
  };
  return renderers[state.view];
}
