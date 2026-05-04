import { getById, usePlanner } from "../state";
import type { Character, Episode, EventEntity, Organization } from "../types";
import { ArchiveSection } from "./detail/ArchiveSection";
import { CharacterDetail } from "./detail/CharacterDetail";
import { EpisodeDetail } from "./detail/EpisodeDetail";
import { EventDetail } from "./detail/EventDetail";
import { OrganizationDetail } from "./detail/OrganizationDetail";
import { ReadOnlyDetail } from "./detail/ReadOnlyDetail";

export function DetailRail() {
  const { state } = usePlanner();
  const item = getById(state.data, state.selectedType, state.selectedId);
  if (!item) {
    return (
      <>
        <div className="detail-header">
          <h2 className="detail-title">선택된 항목 없음</h2>
        </div>
        <ArchiveSection />
      </>
    );
  }

  return (
    <>
      {state.editMode ? (
        <EditableDetail item={item} selectedType={state.selectedType} />
      ) : (
        <ReadOnlyDetail item={item} />
      )}
      <ArchiveSection />
    </>
  );
}

function EditableDetail({
  item,
  selectedType,
}: {
  item: Character | Organization | EventEntity | Episode;
  selectedType: string;
}) {
  if (selectedType === "character") return <CharacterDetail character={item as Character} />;
  if (selectedType === "organization") return <OrganizationDetail org={item as Organization} />;
  if (selectedType === "episode") return <EpisodeDetail episode={item as Episode} />;
  return <EventDetail event={item as EventEntity} />;
}
