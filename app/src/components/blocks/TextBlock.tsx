interface TextBlockProps {
  content: string
}

export default function TextBlock({ content }: TextBlockProps) {
  // Parser simple pour transformer les ligne en paragraphes
  const paragraphs = content.split('\n\n').filter(p => p.trim())

  return (
    <div className="text-block">
      {paragraphs.map((para, idx) => {
        // Gérer les listes à puces
        if (para.trim().startsWith('•') || para.trim().startsWith('-')) {
          const lines = para.split('\n').filter(l => l.trim())
          return (
            <ul key={idx} className="bullet-list">
              {lines.map((line, lidx) => (
                <li key={lidx}>{line.replace(/^[•-]\s*/, '')}</li>
              ))}
            </ul>
          )
        }

        // Gérer les emoji au début
        if (/^[✓❌⚠️🎯]/u.test(para.trim())) {
          return (
            <div key={idx} className="emphasized-text">
              {para}
            </div>
          )
        }

        return (
          <p key={idx} className="text-paragraph">
            {para}
          </p>
        )
      })}
    </div>
  )
}
