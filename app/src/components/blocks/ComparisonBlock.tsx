import { ComparisonItem } from '../../data/tutorials'
import './ComparisonBlock.css'

interface ComparisonBlockProps {
  title: string
  items: ComparisonItem[]
}

export default function ComparisonBlock({ title, items }: ComparisonBlockProps) {
  return (
    <div className="comparison-block">
      <h4 className="comparison-title">⚖️ {title}</h4>

      <div className="comparison-grid">
        {items.map((item, idx) => (
          <div key={idx} className="comparison-item">
            <div className="comparison-item__header">
              <h5 className="comparison-item__name">{item.name}</h5>
            </div>

            <p className="comparison-item__description">
              {item.description}
            </p>

            <div className="comparison-section">
              <h6 className="comparison-section__title">✓ Avantages</h6>
              <ul className="comparison-list">
                {item.pros.map((pro, pidx) => (
                  <li key={pidx} className="comparison-item__pro">{pro}</li>
                ))}
              </ul>
            </div>

            <div className="comparison-section">
              <h6 className="comparison-section__title">✗ Inconvénients</h6>
              <ul className="comparison-list">
                {item.cons.map((con, cidx) => (
                  <li key={cidx} className="comparison-item__con">{con}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
