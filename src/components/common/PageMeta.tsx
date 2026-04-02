import { useEffect } from "react";
import { APP_NAME } from "@/lib/constants";

interface PageMetaProps {
  title: string;
  description: string;
}

export const PageMeta = ({ title, description }: PageMetaProps) => {
  useEffect(() => {
    document.title = `${title} | ${APP_NAME}`;

    const descriptionTag =
      document.querySelector('meta[name="description"]') ??
      document.createElement("meta");

    descriptionTag.setAttribute("name", "description");
    descriptionTag.setAttribute("content", description);

    if (!descriptionTag.parentElement) {
      document.head.appendChild(descriptionTag);
    }
  }, [description, title]);

  return null;
};
