import type { PropsWithChildren, ReactNode } from 'react'

export default function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: PropsWithChildren<{
  readonly title: string
  readonly description?: ReactNode
  readonly onClose: () => void
  readonly wide?: boolean
}>): React.JSX.Element {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        className={`modal-card${wide ? ' modal-card-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-heading">
          <div>
            <h2>{title}</h2>
            {description !== undefined && <p>{description}</p>}
          </div>
          <button className="modal-close" type="button" aria-label="关闭" onClick={onClose}>×</button>
        </header>
        {children}
      </section>
    </div>
  )
}
