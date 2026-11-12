import { useRef, useState, type ReactNode } from "react";
import { Button, Carousel } from "antd";
import type { CarouselRef } from "antd/es/carousel";
import {
  ArrowRightOutlined,
  BellOutlined,
  LeftOutlined,
  RightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FireOutlined,
  WarningOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import type { Actor, DashboardView, TaskRow } from "@codecash/contracts";
import {
  formatDate,
  formatDecimalString,
  formatTime,
} from "@/shared/lib/format";
import styles from "./WelcomeBanner.module.css";

interface FeedItem {
  key: string;
  source: "task" | "notice";
  urgent: boolean;
  title: string;
  subject: string;
  meta: string;
  href: string;
  action: string;
}

interface Chip {
  key: string;
  count: number;
  /** `alert` for what is already late, `warn` for what needs attention soon. */
  tone?: "alert" | "warn";
}

/** Slides per card: the user's own tasks in one, what needs attention in their scope in the other. */
const MAX_SLIDES = 8;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Greeting at the top of the overview: who is signed in, one sentence on where things stand, a
 * button to the most urgent task, and cards that rotate through the user's tasks and notices.
 * Rotation pauses on hover and focus, and stays still when the system asks for reduced motion.
 */
export function WelcomeBanner({
  user,
  data,
  tasks,
}: {
  user: Actor;
  data: DashboardView;
  /** The user's own open tasks (group MINE); null when the role has no task inbox. */
  tasks: TaskRow[] | null;
}) {
  const { t } = useTranslation("dashboard");
  const { t: tc } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const navigate = useNavigate();
  const hour = new Date().getHours();
  const part = hour < 11 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const late =
    tasks?.filter((task) => task.badge === "LATE_PENALTY_RISK") ?? [];
  const disputes = data.attention.filter(
    (a) => a.kind === "OPEN_DISPUTE",
  ).length;
  const milestoneName = (sequence: number | null) =>
    sequence ? td("milestoneNo", { no: sequence }) : "";

  const slides: FeedItem[] = (() => {
    const own: FeedItem[] = (tasks ?? []).map((task) => ({
      key: `task-${task.id}`,
      source: "task",
      urgent: task.overdueDays > 0 || task.badge === "LATE_PENALTY_RISK",
      title: td(`taskKind.${task.kind}`),
      subject: [
        task.contractId,
        milestoneName(task.sequence),
        task.contractTitle,
      ]
        .filter(Boolean)
        .join(" · "),
      meta:
        task.overdueDays > 0
          ? t("banner.overdue", { count: task.overdueDays })
          : task.dueDate
            ? t("banner.due", { date: formatDate(task.dueDate) })
            : "",
      href: task.href,
      action: t("banner.doIt"),
    }));
    const taken = new Set(
      (tasks ?? []).map((task) => `${task.contractId}-${task.sequence}`),
    );
    const notices: FeedItem[] = data.attention
      .filter((a) => !taken.has(`${a.contractId}-${a.sequence}`))
      .map((a, index) => ({
        key: `notice-${a.contractId}-${a.sequence}-${a.kind}-${index}`,
        source: "notice",
        urgent: a.kind === "OPEN_DISPUTE" || a.kind === "OVERDUE",
        title: t(`attention.kind.${a.kind}`),
        subject: `${a.contractId} · ${milestoneName(a.sequence)}`,
        meta: [
          t("million", { value: formatDecimalString(a.amountMillion) }),
          a.dueDate ? t("attention.due", { date: formatDate(a.dueDate) }) : "",
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/contracts/${a.contractId}/milestones/${a.sequence}/${
          a.kind === "OPEN_DISPUTE" ? "dispute" : "decision"
        }`,
        action: t("banner.view"),
      }));
    return [...own.slice(0, MAX_SLIDES), ...notices.slice(0, MAX_SLIDES)];
  })();

  const first = tasks?.[0];
  // Short figures instead of a sentence: each chip is one number with its word.
  const chips: Chip[] =
    tasks === null
      ? [
          { key: "contracts", count: data.contractCount },
          {
            key: "attention",
            count: data.attentionCount,
            tone: data.attentionCount ? "warn" : undefined,
          },
        ]
      : [
          { key: "tasks", count: tasks.length },
          {
            key: "late",
            count: late.length,
            tone: late.length ? "alert" : undefined,
          },
          {
            key: "overdue",
            count: data.milestones.overdue,
            tone: data.milestones.overdue ? "warn" : undefined,
          },
          {
            key: "disputes",
            count: disputes,
            tone: disputes ? "warn" : undefined,
          },
        ];

  return (
    <section className={styles.banner} data-testid="welcome-banner">
      <span className={styles.decor} aria-hidden />
      <div className={styles.greeting}>
        <p className={styles.kicker}>
          <span className={styles.kickerDot} />
          {t(`banner.hello.${part}`)} · {formatDate(data.today)}
        </p>
        <h2 className={styles.name}>{user.displayName}</h2>
        <p className={styles.role}>
          {tc(`roles.${user.role}.name`)} · {user.roleChipOrganization}
        </p>
        <ul className={styles.chips} data-testid="banner-chips">
          {chips.map((chip) => (
            <li
              key={chip.key}
              data-tone={chip.tone}
              data-zero={chip.count === 0 || undefined}
            >
              <b>{chip.count}</b>
              {t(`banner.chips.${chip.key}`, { count: chip.count })}
            </li>
          ))}
        </ul>
        <div className={styles.greetingFoot}>
          {first ? (
            <Button
              className={styles.cta}
              icon={<ThunderboltOutlined />}
              onClick={() => navigate(first.href)}
              data-testid="banner-first-task"
            >
              {t("banner.start", { task: td(`taskKind.${first.kind}`) })}
            </Button>
          ) : (
            <span className={styles.clear}>
              <CheckCircleOutlined /> {t("banner.clear")}
            </span>
          )}
          <span className={styles.updated}>
            {t("updated", { at: formatTime(data.generatedAt) })}
          </span>
        </div>
      </div>
      <FeedCard
        title={t("banner.source.task")}
        icon={<ClockCircleOutlined />}
        slides={slides.filter((slide) => slide.source === "task")}
        empty={tasks === null ? null : t("banner.clear")}
        more={
          tasks === null ? undefined : { label: t("banner.all"), to: "/tasks" }
        }
        testId="banner-tasks"
      />
      <FeedCard
        title={t("banner.source.notice")}
        icon={<BellOutlined />}
        slides={slides.filter((slide) => slide.source === "notice")}
        empty={t("banner.emptyFeedHint")}
        more={{ label: t("banner.all"), to: "#dashboard-attention" }}
        testId="banner-notices"
      />
    </section>
  );
}

/**
 * One rotating card: a header with its title, position and previous/next buttons, then one item
 * at a time. Rotation pauses on hover and focus and stays still under reduced motion.
 */
function FeedCard({
  title,
  icon,
  slides,
  empty,
  more,
  testId,
}: {
  title: string;
  icon: ReactNode;
  slides: FeedItem[];
  /** Text when there is nothing; null hides the card. */
  empty: string | null;
  more?: { label: string; to: string };
  testId: string;
}) {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const carousel = useRef<CarouselRef>(null);
  const [index, setIndex] = useState(0);
  if (!slides.length && empty === null) return null;
  return (
    <article className={styles.feedCard} data-testid={testId}>
      <header className={styles.feedHead}>
        <b className={styles.feedTitle}>
          {icon} {title}
          {more ? (
            more.to.startsWith("#") ? (
              <a className={styles.feedMore} href={more.to}>
                {more.label}
              </a>
            ) : (
              <Link className={styles.feedMore} to={more.to}>
                {more.label}
              </Link>
            )
          ) : null}
        </b>
        {slides.length > 1 ? (
          <span className={styles.feedNav}>
            <span className={styles.counter}>
              {index + 1}/{slides.length}
            </span>
            <Button
              type="text"
              size="small"
              icon={<LeftOutlined />}
              aria-label={t("banner.previous")}
              onClick={() => carousel.current?.prev()}
            />
            <Button
              type="text"
              size="small"
              icon={<RightOutlined />}
              aria-label={t("banner.next")}
              onClick={() => carousel.current?.next()}
            />
          </span>
        ) : null}
      </header>
      {slides.length ? (
        <Carousel
          ref={carousel}
          autoplay={!prefersReducedMotion()}
          autoplaySpeed={5000}
          pauseOnHover
          pauseOnFocus
          draggable
          dots={false}
          beforeChange={(_from, to) => setIndex(to)}
        >
          {slides.map((slide) => (
            <div key={slide.key} className={styles.slideFrame}>
              <div
                className={styles.slide}
                data-urgent={slide.urgent || undefined}
                data-testid="banner-slide"
              >
                <div className={styles.slideHead}>
                  <span
                    className={styles.slideIcon}
                    data-tone={
                      slide.urgent
                        ? "danger"
                        : slide.source === "task"
                          ? "primary"
                          : "warning"
                    }
                    aria-hidden
                  >
                    {slide.urgent ? (
                      slide.source === "task" ? (
                        <FireOutlined />
                      ) : (
                        <ExclamationCircleOutlined />
                      )
                    ) : slide.source === "task" ? (
                      <ClockCircleOutlined />
                    ) : (
                      <WarningOutlined />
                    )}
                  </span>
                  <span className={styles.slideText}>
                    <b className={styles.cardTitle}>{slide.title}</b>
                    <span className={styles.cardSubject}>{slide.subject}</span>
                  </span>
                </div>
                <div className={styles.cardBottom}>
                  <span className={styles.cardMeta}>{slide.meta}</span>
                  <Button
                    size="small"
                    type={slide.urgent ? "primary" : "default"}
                    danger={slide.urgent && slide.source === "notice"}
                    iconPlacement="end"
                    icon={<ArrowRightOutlined />}
                    onClick={() => navigate(slide.href)}
                  >
                    {slide.action}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </Carousel>
      ) : (
        <p className={styles.feedEmpty}>
          <CheckCircleOutlined /> {empty}
        </p>
      )}
    </article>
  );
}
