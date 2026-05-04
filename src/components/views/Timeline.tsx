import { activeItems, matchesQuery, usePlanner } from "../../state";
import { Icon } from "../../ui/icons";
import type { EventEntity, TimelineMode, TimelinePhase } from "../../types";
import { EditableHint, OrgTags, PageHeading, PeopleTags } from "../common";
import type { ReactNode } from "react";

const TIMELINE_PHASES: readonly TimelinePhase[] = ["과거", "Act 1", "Act 2", "Act 3"];
type EventCardVariant = "default" | "psych";

export function Timeline() {
  const { state, actions } = usePlanner();
  const activeEvents = activeItems(state.data.events);
  const queryFiltered = activeEvents.filter((event) =>
    matchesQuery(event as unknown as Record<string, unknown>, ["title", "date", "summary", "tags", "emotion"], state.query),
  );
  const relationFiltered = state.timelineUnlinkedOnly ? queryFiltered.filter(hasMissingTimelineRelation) : queryFiltered;
  const filtered = state.timelinePhaseFilter
    ? relationFiltered.filter((event) => event.phase === state.timelinePhaseFilter)
    : relationFiltered;
  const phaseCounts = countEventsByPhase(relationFiltered);

  return (
    <>
      <PageHeading
        title="사건, 감정, 조직 영향이 함께 보이는 타임라인"
        copy="사건을 클릭하면 오른쪽 패널에서 관련 인물의 심리 변화와 연결 조직을 확인합니다."
      >
        <button className="text-button primary" type="button" onClick={() => actions.createItem("event")}>
          <Icon name="plus" />
          사건 추가
        </button>
      </PageHeading>
      <div className="toolbar">
        <div className="segments">
          <SegmentButton mode="story" label="이야기 순서" />
          <SegmentButton mode="episode" label="회차 기준" />
          <SegmentButton mode="psych" label="심리선" />
        </div>
        <button
          className={`text-button timeline-filter-button ${state.timelineUnlinkedOnly ? "active" : ""}`}
          type="button"
          aria-pressed={state.timelineUnlinkedOnly}
          onClick={() => actions.setTimelineUnlinkedOnly(!state.timelineUnlinkedOnly)}
        >
          <Icon name="filter" />
          관계 미연결만
        </button>
      </div>
      <div className="timeline-layout">
        <div className="timeline-years" aria-label="구간 필터">
          {TIMELINE_PHASES.map((phase) => (
            <PhaseChip count={phaseCounts[phase]} key={phase} phase={phase} />
          ))}
        </div>
        <TimelineModeBoard activeEvents={activeEvents} events={filtered} />
      </div>
    </>
  );
}

function SegmentButton({ mode, label }: { mode: TimelineMode; label: string }) {
  const { state, actions } = usePlanner();
  return (
    <button
      className={`segment-button ${state.timelineMode === mode ? "active" : ""}`}
      type="button"
      onClick={() => actions.setTimelineMode(mode)}
    >
      {label}
    </button>
  );
}

function PhaseChip({ phase, count }: { phase: TimelinePhase; count: number }) {
  const { state, actions } = usePlanner();
  const active = state.timelinePhaseFilter === phase;
  return (
    <button
      className={`year-chip ${active ? "active" : ""}`}
      type="button"
      aria-pressed={active}
      onClick={() => actions.setTimelinePhaseFilter(active ? "" : phase)}
    >
      <span>{phase}</span>
      <strong>{count}</strong>
    </button>
  );
}

function TimelineModeBoard({ events, activeEvents }: { events: EventEntity[]; activeEvents: EventEntity[] }) {
  const { state } = usePlanner();
  if (state.timelineMode === "episode") return <EpisodeTimelineBoard events={events} />;
  if (state.timelineMode === "psych") return <PsychTimelineBoard events={events} />;
  return <StoryTimelineBoard activeEvents={activeEvents} events={events} />;
}

function StoryTimelineBoard({ events, activeEvents }: { events: EventEntity[]; activeEvents: EventEntity[] }) {
  const { state } = usePlanner();
  const indexById = new Map(activeEvents.map((event, index) => [event.id, index]));
  const phases: readonly TimelinePhase[] = state.timelinePhaseFilter ? [state.timelinePhaseFilter] : TIMELINE_PHASES;

  return (
    <div className="timeline-board timeline-story-board">
      {phases.map((phase) => {
        const phaseEvents = sortEventsForStory(
          events.filter((event) => event.phase === phase),
          indexById,
        );
        return (
          <TimelineColumn count={phaseEvents.length} key={phase} meta={phaseMeta(phase)} title={phase}>
            <EventStack events={phaseEvents} />
          </TimelineColumn>
        );
      })}
    </div>
  );
}

function EpisodeTimelineBoard({ events }: { events: EventEntity[] }) {
  const { state } = usePlanner();
  const activeEpisodes = activeItems(state.data.episodes);
  const eventById = new Map(events.map((event) => [event.id, event]));
  const assignedEventIds = new Set<string>();

  activeEpisodes.forEach((episode) => {
    episode.events.forEach((eventId) => assignedEventIds.add(eventId));
  });

  const unassignedEvents = events.filter((event) => !assignedEventIds.has(event.id));

  return (
    <div className="timeline-board timeline-board-scroll timeline-episode-board">
      {activeEpisodes.map((episode) => {
        const episodeEvents = episode.events.map((eventId) => eventById.get(eventId)).filter(isEventEntity);
        return (
          <TimelineColumn count={episodeEvents.length} key={episode.id} meta={`${episode.act} · ${episode.hook}`} title={episode.title}>
            <EventStack events={episodeEvents} />
          </TimelineColumn>
        );
      })}
      <TimelineColumn count={unassignedEvents.length} meta="연결된 회차가 없는 사건" title="미배정">
        <EventStack events={unassignedEvents} />
      </TimelineColumn>
    </div>
  );
}

function PsychTimelineBoard({ events }: { events: EventEntity[] }) {
  const { state } = usePlanner();
  if (!events.length) return <div className="empty-state">검색 결과가 없습니다.</div>;

  const activeCharacters = activeItems(state.data.characters);
  const activeCharacterIds = new Set(activeCharacters.map((character) => character.id));
  const eventCharacterIds = Array.from(new Set(events.flatMap((event) => event.characters)));
  const characterLanes = activeCharacters
    .filter((character) => eventCharacterIds.includes(character.id))
    .map((character) => ({
      id: character.id,
      title: character.name,
      events: events.filter((event) => event.characters.includes(character.id)),
    }));
  const unknownCharacterLanes = eventCharacterIds
    .filter((characterId) => !activeCharacterIds.has(characterId))
    .map((characterId) => ({
      id: characterId,
      title: characterId,
      events: events.filter((event) => event.characters.includes(characterId)),
    }));
  const unassignedEvents = events.filter((event) => event.characters.length === 0);
  const lanes = [...characterLanes, ...unknownCharacterLanes];

  return (
    <div className="timeline-lanes">
      {lanes.map((lane) => (
        <TimelineLane count={lane.events.length} key={lane.id} title={lane.title}>
          <EventStack events={lane.events} variant="psych" />
        </TimelineLane>
      ))}
      {unassignedEvents.length ? (
        <TimelineLane count={unassignedEvents.length} title="미배정">
          <EventStack events={unassignedEvents} variant="psych" />
        </TimelineLane>
      ) : null}
    </div>
  );
}

function TimelineColumn({ title, meta, count, children }: { title: string; meta?: string; count: number; children: ReactNode }) {
  return (
    <section className="timeline-column">
      <div className="timeline-column-header">
        <div>
          <h3>{title}</h3>
          {meta ? <p>{meta}</p> : null}
        </div>
        <strong>{count}</strong>
      </div>
      {children}
    </section>
  );
}

function TimelineLane({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="timeline-lane">
      <div className="timeline-column-header timeline-lane-header">
        <div>
          <h3>{title}</h3>
          <p>관련 사건</p>
        </div>
        <strong>{count}</strong>
      </div>
      {children}
    </section>
  );
}

function EventStack({ events, variant = "default" }: { events: EventEntity[]; variant?: EventCardVariant }) {
  return (
    <div className="timeline-card-stack">
      {events.length ? events.map((event) => <EventCard event={event} key={event.id} variant={variant} />) : <div className="empty-state">검색 결과 없음</div>}
    </div>
  );
}

function EventCard({ event, variant = "default" }: { event: EventEntity; variant?: EventCardVariant }) {
  const { state, actions } = usePlanner();
  const selected = state.selectedType === "event" && state.selectedId === event.id;
  return (
    <button
      className={`event-card ${selected ? "selected" : ""} ${variant === "psych" ? "psych-card" : ""}`}
      type="button"
      onClick={() => actions.select("event", event.id)}
    >
      <div className="event-time">
        {event.date}
        <br />
        {event.phase}
      </div>
      <div className="event-main">
        <h3>{event.title}</h3>
        <p>{event.summary}</p>
        {variant === "psych" && event.emotion ? (
          <div className="event-emotion">
            <strong>심리</strong>
            <span>{event.emotion}</span>
          </div>
        ) : null}
        <div className="tag-row">
          <PeopleTags ids={event.characters} />
          <OrgTags ids={event.organizations} />
        </div>
      </div>
      <div className="event-impact">
        <span className="impact-score">{event.impact}</span>
        <span className="tag clay">{event.tags[0] || ""}</span>
        <EditableHint />
      </div>
    </button>
  );
}

function hasMissingTimelineRelation(event: EventEntity) {
  return event.characters.length === 0 || event.organizations.length === 0;
}

function countEventsByPhase(events: EventEntity[]) {
  const counts = Object.fromEntries(TIMELINE_PHASES.map((phase) => [phase, 0])) as Record<TimelinePhase, number>;
  events.forEach((event) => {
    if (isTimelinePhase(event.phase)) counts[event.phase] += 1;
  });
  return counts;
}

function isTimelinePhase(value: string): value is TimelinePhase {
  return TIMELINE_PHASES.includes(value as TimelinePhase);
}

function isEventEntity(event: EventEntity | undefined): event is EventEntity {
  return Boolean(event);
}

function sortEventsForStory(events: EventEntity[], indexById: Map<string, number>) {
  return [...events].sort((left, right) => {
    const leftKey = dateSortKey(left.date);
    const rightKey = dateSortKey(right.date);
    if (leftKey && rightKey && leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
    return (indexById.get(left.id) ?? 0) - (indexById.get(right.id) ?? 0);
  });
}

function dateSortKey(date: string) {
  const match = date.match(/\d{4}(?:[./-]\d{1,2})?(?:[./-]\d{1,2})?/);
  return match ? match[0].replace(/\D/g, "").padEnd(8, "0") : "";
}

function phaseMeta(phase: TimelinePhase) {
  const descriptions: Record<TimelinePhase, string> = {
    과거: "원점과 숨겨진 원인",
    "Act 1": "발견과 첫 충돌",
    "Act 2": "압박과 정체성 전환",
    "Act 3": "증언과 송출",
  };
  return descriptions[phase];
}
