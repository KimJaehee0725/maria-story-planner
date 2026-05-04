import { activeItems, nameFor, usePlanner } from "../../state";
import { Icon } from "../../ui/icons";
import type { Character } from "../../types";
import { EditInput, EditTextarea, ReverseEventChecklist } from "../editors";
import { connectedLinks } from "./detail-helpers";
import { EditorHeader } from "./EditorHeader";

export function CharacterDetail({ character }: { character: Character }) {
  const { state, actions } = usePlanner();
  const events = activeItems(state.data.events).filter((event) => event.characters.includes(character.id));
  const links = connectedLinks(state.data, character.id);
  return (
    <>
      <EditorHeader kind="Character Editor" title={character.name} subtitle={`${character.role} · ${character.org}`} />
      <form className="edit-form" onSubmit={(event) => event.preventDefault()}>
        <section className="detail-section">
          <div className="inline-field-grid">
            <EditInput type="character" id={character.id} field="name" label="이름" value={character.name} />
            <EditInput type="character" id={character.id} field="avatar" label="아바타 표기" value={character.avatar} />
          </div>
          <EditInput type="character" id={character.id} field="role" label="역할" value={character.role} />
          <EditInput type="character" id={character.id} field="org" label="소속" value={character.org} />
          <EditInput type="character" id={character.id} field="tags" label="태그" value={character.tags.join(", ")} hint="쉼표로 구분" />
        </section>
        <section className="detail-section">
          <EditTextarea type="character" id={character.id} field="desire" label="욕망" value={character.desire} />
          <EditTextarea type="character" id={character.id} field="wound" label="결핍/상처" value={character.wound} />
          <EditTextarea type="character" id={character.id} field="secret" label="비밀" value={character.secret} />
          <EditTextarea type="character" id={character.id} field="contradiction" label="내적 모순" value={character.contradiction} />
        </section>
        <section className="detail-section">
          <EditInput type="character" id={character.id} field="arc" label="심리 아크" value={character.arc.join(", ")} hint="6단계 권장" />
          <ReverseEventChecklist type="character" id={character.id} label="등장 사건 연결" />
        </section>
      </form>
      <section className="detail-section">
        <h3>현재 연결 관계</h3>
        <div className="link-list">
          {links.map((link) => (
            <div className="link-item" key={link.id || `${link.from}-${link.to}-${link.label}`}>
              <strong>
                {nameFor(state.data, link.from)} ↔ {nameFor(state.data, link.to)}
              </strong>
              <span>
                {link.type} · {link.label}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="detail-section">
        <div className="detail-actions">
          {events.map((event) => (
            <button className="chip-button" type="button" key={event.id} onClick={() => actions.select("event", event.id)}>
              {event.title}
            </button>
          ))}
          <button className="text-button" type="button" onClick={() => actions.setView("characters")}>
            <Icon name="users-round" />
            인물 시트
          </button>
          <button className="text-button" type="button" onClick={() => actions.setView("graph")}>
            <Icon name="network" />
            관계도
          </button>
        </div>
      </section>
    </>
  );
}
