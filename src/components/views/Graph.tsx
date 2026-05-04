import { graphPositions } from "../../app-config";
import { activeItems, typeForId, usePlanner } from "../../state";
import { PageHeading } from "../common";

export function Graph() {
  const { state, actions } = usePlanner();
  const { data } = state;
  const nodes = [
    ...activeItems(data.characters).map((item) => ({ ...item, graphType: "character", label: item.role, name: item.name })),
    ...activeItems(data.organizations).map((item) => ({
      ...item,
      graphType: "organization",
      label: item.type,
      name: item.name,
    })),
    ...activeItems(data.events)
      .filter((event) => ["e3", "e7"].includes(event.id))
      .map((item) => ({ ...item, name: item.title, graphType: "event", label: item.phase })),
  ].filter((node) => graphPositions[node.id]);
  const activeNodeIds = new Set(nodes.map((node) => node.id));
  const lines = activeItems(data.links).filter((link) => activeNodeIds.has(link.from) && activeNodeIds.has(link.to));

  return (
    <>
      <PageHeading
        title="인물, 조직, 사건을 한 보드에서 연결"
        copy="노드를 클릭하면 상세 패널이 바뀌고, 연결된 사건과 이해관계를 함께 봅니다."
      >
        <div className="tag-row">
          <span className="tag sage">인물</span>
          <span className="tag ochre">조직</span>
          <span className="tag clay">사건</span>
        </div>
      </PageHeading>
      <div className="graph-board">
        <svg className="graph-svg" viewBox="0 0 840 640" preserveAspectRatio="xMinYMin meet" aria-hidden="true">
          {lines.map((link) => {
            const from = graphPositions[link.from];
            const to = graphPositions[link.to];
            const x1 = from.x + 72;
            const y1 = from.y + 37;
            const x2 = to.x + 72;
            const y2 = to.y + 37;
            const lx = (x1 + x2) / 2;
            const ly = (y1 + y2) / 2 - 6;
            const kind = link.type === "적대" || link.type === "압박" ? "conflict" : link.type === "비밀" ? "secret" : "";
            return (
              <g key={link.id || `${link.from}-${link.to}-${link.label}`}>
                <line className={`edge-line ${kind}`} x1={x1} y1={y1} x2={x2} y2={y2} />
                <text className="edge-label" x={lx} y={ly} textAnchor="middle">
                  {link.label}
                </text>
              </g>
            );
          })}
        </svg>
        {nodes.map((node) => {
          const pos = graphPositions[node.id];
          const type = typeForId(data, node.id);
          return (
            <button
              className={`graph-node ${node.graphType} ${state.selectedId === node.id ? "selected" : ""}`}
              style={{ left: pos.x, top: pos.y }}
              type="button"
              key={node.id}
              onClick={() => actions.select(type, node.id)}
            >
              <strong>{node.name}</strong>
              <span>{node.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
