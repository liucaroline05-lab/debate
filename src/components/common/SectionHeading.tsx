import type { ReactNode } from "react";

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}

export const SectionHeading = ({
  eyebrow,
  title,
  description,
  action,
}: SectionHeadingProps) => (
  <div className="row-between">
    <div className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
    {action}
  </div>
);
