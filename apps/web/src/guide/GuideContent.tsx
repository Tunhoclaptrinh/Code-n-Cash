import { DemoContractDownloads } from "./DemoContractDownloads";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { PageState } from "@/shared/ui/PageState";
import { GuideMarkdown } from "./GuideMarkdown";
import { loadGuide, type GuideTopic } from "./topics";

/** One topic of the guide in the current language; scrolls to `#anchor` once rendered. */
export function GuideContent({ topic }: { topic: GuideTopic }) {
  const { i18n } = useTranslation();
  const { hash } = useLocation();
  const source = useQuery({
    queryKey: ["guide", topic, i18n.language],
    queryFn: () => loadGuide(topic, i18n.language),
    staleTime: Number.POSITIVE_INFINITY,
  });
  useEffect(() => {
    if (!source.data || !hash) return;
    document
      .getElementById(decodeURIComponent(hash.slice(1)))
      ?.scrollIntoView({ block: "start" });
  }, [source.data, hash]);
  if (source.isPending) return <PageState kind="loading" />;
  if (source.isError) return <PageState kind="error" />;
  return (
    <>
      {topic === "signing" || topic === "start" ? (
        <DemoContractDownloads />
      ) : null}
      <GuideMarkdown source={source.data} />
    </>
  );
}
