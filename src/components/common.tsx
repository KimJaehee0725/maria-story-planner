import type { ReactNode } from "react";
import { Icon } from "../ui/icons";
import { nameFor, usePlanner } from "../state";

export function PageHeading({
  title,
  copy,
  children,
}: {
  title: string;
  copy: string;
  children?: ReactNode;
}) {
  return (
    <section className="page-heading">
      <div>
        <h2 className="page-title">{title}</h2>
        <p className="page-copy">{copy}</p>
      </div>
      {children}
    </section>
  );
}

export function TagRow({ values, tone = "" }: { values: string[]; tone?: string }) {
  return (
    <div className="tag-row">
      {values.map((value) => (
        <span className={`tag ${tone}`} key={value}>
          {value}
        </span>
      ))}
    </div>
  );
}

export function PeopleTags({ ids }: { ids: string[] }) {
  const { state } = usePlanner();
  return ids.map((id) => (
    <span className="tag sage" key={id}>
      {nameFor(state.data, id)}
    </span>
  ));
}

export function OrgTags({ ids }: { ids: string[] }) {
  const { state } = usePlanner();
  return ids.map((id) => (
    <span className="tag ochre" key={id}>
      {nameFor(state.data, id)}
    </span>
  ));
}

export function EditableHint() {
  return (
    <span className="editable-hint">
      <Icon name="square-pen" />
      편집
    </span>
  );
}
