import './MemoBlock.css'

interface MemoBlockProps {
  title: string
  content: string
  icon: string
}

export default function MemoBlock({ title, content, icon }: MemoBlockProps) {
  return (
    <div className="memo-block">
      <div className="memo-block__header">
        <span className="memo-block__icon">{icon}</span>
        <h5 className="memo-block__title">{title}</h5>
      </div>
      
      <div className="memo-block__content">
        {content.split('\n').map((line, idx) => (
          <div key={idx} className="memo-line">
            {line}
          </div>
        ))}
      </div>

      <p className="memo-block__note">📌 Sauvegardez cette fiche pour consulter rapidement</p>
    </div>
  )
}
