import { Component, type ReactNode, type ErrorInfo } from "react";
import { Result, Button } from "antd";
import { uiText } from "../../i18n";
export class ErrorBoundary extends Component<
  {
    children: ReactNode;
  },
  {
    failed: boolean;
  }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }
  render() {
    return this.state.failed ? (
      <Result
        status="error"
        title={uiText("error.title")}
        subTitle={uiText("error.hint")}
        extra={
          <Button onClick={() => window.location.reload()}>
            {uiText("action.retry")}
          </Button>
        }
      />
    ) : (
      this.props.children
    );
  }
}
