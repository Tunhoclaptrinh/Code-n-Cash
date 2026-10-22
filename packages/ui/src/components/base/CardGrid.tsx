import { uiText } from "../../i18n";
import { Row, Col } from "antd";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { CardGridProps } from "./types";
export function CardGrid<T = any>({
  data = [],
  loading = false,
  renderCard,
  emptyTitle = uiText("s1a567dab5f"),
  emptyDescription = uiText("sc957f30d7a"),
  colProps = {
    xs: 24,
    sm: 12,
    md: 8,
    lg: 6,
  },
  gutter = [16, 16],
  keyExtractor,
}: CardGridProps<T>) {
  if (loading) {
    return <LoadingState tip={uiText("sd37b2a68bf")} />;
  }
  if (!data || data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <Row gutter={gutter}>
      {data.map((item, index) => {
        const key = keyExtractor
          ? keyExtractor(item, index)
          : (item as any).id || (item as any)._id || index;
        return (
          <Col key={key} {...colProps}>
            {renderCard(item, index)}
          </Col>
        );
      })}
    </Row>
  );
}
