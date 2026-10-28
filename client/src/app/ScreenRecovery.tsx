import { Component, createRef, type ReactNode } from 'react'

/** A failed screen download must not leave the runner staring at a blank page. */
export class ScreenRecovery extends Component<{ children: ReactNode; reload?: () => void }, { failed: boolean }> {
  state = { failed: false }
  private heading = createRef<HTMLHeadingElement>()

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.heading.current?.focus()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="panel screen-recovery" role="alert">
        <h2 ref={this.heading} tabIndex={-1}>This screen couldn’t load</h2>
        <p>Check your connection, then reload this screen. Your saved plan and runs won’t be removed.</p>
        <button type="button" className="button" onClick={() => this.props.reload ? this.props.reload() : window.location.reload()}>Reload this screen</button>
      </section>
    )
  }
}
