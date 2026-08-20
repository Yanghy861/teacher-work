import { Component, type ErrorInfo, type ReactNode } from 'react'

interface RendererErrorBoundaryProps {
  readonly children: ReactNode
}

interface RendererErrorBoundaryState {
  readonly hasError: boolean
}

export class RendererErrorBoundary extends Component<
  RendererErrorBoundaryProps,
  RendererErrorBoundaryState
> {
  state: RendererErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): RendererErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[teacher-workbench] renderer error boundary', {
      name: error.name,
      componentStack: errorInfo.componentStack,
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <section className="error-card" role="alert">
          <h2>页面暂时无法显示</h2>
          <p>请重试当前操作；如果问题持续，请查看开发日志。</p>
        </section>
      )
    }
    return this.props.children
  }
}
